package store_test

import (
	"errors"
	"testing"
	"time"

	"careconnect/internal/domain/booking"
	"careconnect/internal/store"
)

func codes(vs []store.BookingView) map[string]bool {
	out := map[string]bool{}
	for _, v := range vs {
		out[v.Code] = true
	}
	return out
}

func TestListBookings_ClientSeesOnlyTheirOwn(t *testing.T) {
	w := seed(t, 2)
	mine, err := w.s.CreateBooking(ctx, w.booking(w.clients[0], tenAM))
	must(t, err)
	theirs, err := w.s.CreateBooking(ctx, w.booking(w.clients[1], tenAM.Add(2*time.Hour)))
	must(t, err)

	got, err := w.s.ListBookings(ctx, store.BookingFilter{ClientID: w.clients[0]})
	must(t, err)

	if c := codes(got); !c[mine.Code] || c[theirs.Code] || len(got) != 1 {
		t.Fatalf("client list = %v", c)
	}
}

func TestListBookings_PsychologistSeesOnlyTheirClients(t *testing.T) {
	w := seed(t, 1)
	other, err := w.s.CreatePsychologist(ctx, store.NewPsychologist{Name: "Other", SessionTypes: []string{"in_person"}, LocationIDs: []string{"bsd"}, ServiceIDs: []string{"adult-60"}})
	must(t, err)
	mine, err := w.s.CreateBooking(ctx, w.booking(w.clients[0], tenAM))
	must(t, err)
	nb := w.booking(w.clients[0], tenAM)
	nb.PsychologistID = other
	_, err = w.s.CreateBooking(ctx, nb)
	must(t, err)

	got, err := w.s.ListBookings(ctx, store.BookingFilter{PsychologistID: w.psychID})
	must(t, err)
	if c := codes(got); len(got) != 1 || !c[mine.Code] {
		t.Fatalf("psychologist list = %v", c)
	}
}

func TestListBookings_FiltersByStatusAndDate(t *testing.T) {
	w := seed(t, 1)
	early, err := w.s.CreateBooking(ctx, w.booking(w.clients[0], tenAM))
	must(t, err)
	late, err := w.s.CreateBooking(ctx, w.booking(w.clients[0], tenAM.AddDate(0, 0, 7)))
	must(t, err)
	must(t, w.s.MarkAttendance(ctx, store.Attendance{BookingID: early.ID, Status: booking.Attended, At: tenAM.Add(time.Hour)}))

	attended, err := w.s.ListBookings(ctx, store.BookingFilter{ClientID: w.clients[0], Status: "attended"})
	must(t, err)
	if c := codes(attended); len(attended) != 1 || !c[early.Code] {
		t.Fatalf("attended = %v", c)
	}
	week2, err := w.s.ListBookings(ctx, store.BookingFilter{ClientID: w.clients[0], From: tenAM.AddDate(0, 0, 1), To: tenAM.AddDate(0, 0, 14)})
	must(t, err)
	if c := codes(week2); len(week2) != 1 || !c[late.Code] {
		t.Fatalf("date range = %v", c)
	}
}

func TestMarkAttendance_NotBeforeTheSessionStarts(t *testing.T) {
	w := seed(t, 1)
	b, err := w.s.CreateBooking(ctx, w.booking(w.clients[0], tenAM))
	must(t, err)
	err = w.s.MarkAttendance(ctx, store.Attendance{BookingID: b.ID, Status: booking.NoShow, At: tenAM.Add(-time.Hour)})
	if !errors.Is(err, booking.ErrSessionNotStarted) {
		t.Fatalf("err = %v", err)
	}
}

func TestListBookings_WithoutAnyScopeIsRefused(t *testing.T) {
	w := seed(t, 0)
	if _, err := w.s.ListBookings(ctx, store.BookingFilter{}); !errors.Is(err, store.ErrUnscoped) {
		t.Fatalf("err = %v, want ErrUnscoped", err)
	}
}
