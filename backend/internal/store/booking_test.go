package store_test

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"careconnect/internal/domain/schedule"
	"careconnect/internal/domain/wib"
	"careconnect/internal/store"
	"careconnect/internal/store/storetest"
)

var ctx = context.Background()

type world struct {
	s       *store.Store
	psychID string
	clients []string
}

func seed(t *testing.T, nClients int) world {
	t.Helper()
	s := storetest.New(t)
	must(t, s.UpsertLocation(ctx, store.Location{ID: "bsd", Name: "BSD (Tangerang)"}))
	must(t, s.UpsertService(ctx, store.Service{ID: "adult-60", Name: "Adult counseling", LengthMinutes: 60, AgeGroup: "adult"}))
	psych, err := s.CreatePsychologist(ctx, store.NewPsychologist{
		Name: "Ayu Lestari", Title: "M.Psi., Psikolog", SessionTypes: []string{"video", "in_person"},
		LocationIDs: []string{"bsd"}, ServiceIDs: []string{"adult-60"},
	})
	must(t, err)
	w := world{s: s, psychID: psych}
	for i := range nClients {
		id, err := s.CreateClient(ctx, store.NewClient{Name: fmt.Sprintf("Test Client %d", i), Email: fmt.Sprintf("c%d@example.test", i), Phone: "081200000000"})
		must(t, err)
		w.clients = append(w.clients, id)
	}
	return w
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

var tenAM = time.Date(2026, 3, 16, 10, 0, 0, 0, wib.Zone)

func (w world) booking(client string, start time.Time) store.NewBooking {
	return store.NewBooking{
		ClientID: client, PsychologistID: w.psychID, ServiceID: "adult-60",
		Mode: schedule.InPerson, LocationID: "bsd",
		Start: start, End: start.Add(time.Hour), Break: 15 * time.Minute,
	}
}

func TestCreateBooking_SameSlotAtTheSameMomentOnlyOneWins(t *testing.T) {
	w := seed(t, 10)

	var wg sync.WaitGroup
	errs := make([]error, len(w.clients))
	start := make(chan struct{})
	for i, c := range w.clients {
		wg.Go(func() {
			<-start
			_, errs[i] = w.s.CreateBooking(ctx, w.booking(c, tenAM))
		})
	}
	close(start)
	wg.Wait()

	won, taken := 0, 0
	for _, err := range errs {
		switch {
		case err == nil:
			won++
		case errors.Is(err, store.ErrSlotTaken):
			taken++
		default:
			t.Fatalf("unexpected error: %v", err)
		}
	}
	if won != 1 || taken != 9 {
		t.Fatalf("won=%d taken=%d, want 1 and 9", won, taken)
	}
}

func TestCreateBooking_BookingInsideTheBreakIsRejected(t *testing.T) {
	w := seed(t, 2)
	_, err := w.s.CreateBooking(ctx, w.booking(w.clients[0], tenAM))
	must(t, err)

	// 11:10 starts inside the 15-minute break after the 10:00-11:00 session.
	_, err = w.s.CreateBooking(ctx, w.booking(w.clients[1], tenAM.Add(70*time.Minute)))
	if !errors.Is(err, store.ErrSlotTaken) {
		t.Fatalf("booking inside break = %v, want ErrSlotTaken", err)
	}
	// 11:15 is fine.
	_, err = w.s.CreateBooking(ctx, w.booking(w.clients[1], tenAM.Add(75*time.Minute)))
	must(t, err)
}

func TestCancelBooking_FreesTheSlot(t *testing.T) {
	w := seed(t, 2)
	first, err := w.s.CreateBooking(ctx, w.booking(w.clients[0], tenAM))
	must(t, err)

	must(t, w.s.CancelBooking(ctx, store.Cancellation{BookingID: first.ID, Reason: "schedule_conflict"}))

	if _, err := w.s.CreateBooking(ctx, w.booking(w.clients[1], tenAM)); err != nil {
		t.Fatalf("rebooking a cancelled slot = %v", err)
	}
}

func TestRescheduleBooking_MovesTimeKeepsCodeAndFreesOldSlot(t *testing.T) {
	w := seed(t, 2)
	b, err := w.s.CreateBooking(ctx, w.booking(w.clients[0], tenAM))
	must(t, err)

	newStart := tenAM.Add(3 * time.Hour)
	must(t, w.s.RescheduleBooking(ctx, store.Reschedule{BookingID: b.ID, Start: newStart, End: newStart.Add(time.Hour), Break: 15 * time.Minute}))

	got, err := w.s.GetBooking(ctx, b.ID)
	must(t, err)
	if got.Code != b.Code || !got.Start.Equal(newStart) || got.Status != "confirmed" {
		t.Fatalf("after reschedule = %+v", got)
	}
	if _, err := w.s.CreateBooking(ctx, w.booking(w.clients[1], tenAM)); err != nil {
		t.Fatalf("old slot not freed: %v", err)
	}
}

func TestRescheduleBooking_IntoATakenSlotLeavesTheOriginalAlone(t *testing.T) {
	w := seed(t, 2)
	mine, err := w.s.CreateBooking(ctx, w.booking(w.clients[0], tenAM))
	must(t, err)
	later := tenAM.Add(3 * time.Hour)
	_, err = w.s.CreateBooking(ctx, w.booking(w.clients[1], later))
	must(t, err)

	err = w.s.RescheduleBooking(ctx, store.Reschedule{BookingID: mine.ID, Start: later, End: later.Add(time.Hour), Break: 15 * time.Minute})
	if !errors.Is(err, store.ErrSlotTaken) {
		t.Fatalf("err = %v, want ErrSlotTaken", err)
	}
	got, err := w.s.GetBooking(ctx, mine.ID)
	must(t, err)
	if !got.Start.Equal(tenAM) {
		t.Fatalf("original moved to %v", got.Start)
	}
}

func TestRescheduleBooking_CancelledBookingCannotMove(t *testing.T) {
	w := seed(t, 1)
	b, err := w.s.CreateBooking(ctx, w.booking(w.clients[0], tenAM))
	must(t, err)
	must(t, w.s.CancelBooking(ctx, store.Cancellation{BookingID: b.ID}))

	err = w.s.RescheduleBooking(ctx, store.Reschedule{BookingID: b.ID, Start: tenAM.Add(time.Hour), End: tenAM.Add(2 * time.Hour)})
	if !errors.Is(err, store.ErrNotChangeable) {
		t.Fatalf("err = %v, want ErrNotChangeable", err)
	}
}
