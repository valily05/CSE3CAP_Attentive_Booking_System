package store_test

import (
	"errors"
	"slices"
	"testing"
	"time"

	"careconnect/internal/domain/notify"
	"careconnect/internal/store"
)

func TestRecordMessage_SameReminderForSameBookingOnlyOnce(t *testing.T) {
	w := seed(t, 1)
	b, err := w.s.CreateBooking(ctx, w.booking(w.clients[0], tenAM))
	must(t, err)

	must(t, w.s.RecordMessage(ctx, store.Message{ClientID: w.clients[0], BookingID: b.ID, Kind: notify.ReminderFirst}))
	err = w.s.RecordMessage(ctx, store.Message{ClientID: w.clients[0], BookingID: b.ID, Kind: notify.ReminderFirst})

	if !errors.Is(err, store.ErrAlreadySent) {
		t.Fatalf("second record = %v, want ErrAlreadySent", err)
	}
}

func TestReminderCandidates_UpcomingConfirmedWithSentKinds(t *testing.T) {
	w := seed(t, 3)
	soon, err := w.s.CreateBooking(ctx, w.booking(w.clients[0], tenAM))
	must(t, err)
	must(t, w.s.RecordMessage(ctx, store.Message{ClientID: w.clients[0], BookingID: soon.ID, Kind: notify.ReminderFirst}))
	cancelled, err := w.s.CreateBooking(ctx, w.booking(w.clients[1], tenAM.Add(2*time.Hour)))
	must(t, err)
	must(t, w.s.CancelBooking(ctx, store.Cancellation{BookingID: cancelled.ID}))
	_, err = w.s.CreateBooking(ctx, w.booking(w.clients[2], tenAM.AddDate(0, 0, 3))) // too far ahead
	must(t, err)

	now := tenAM.Add(-20 * time.Hour)
	got, err := w.s.ReminderCandidates(ctx, now, now.Add(25*time.Hour))
	must(t, err)

	if len(got) != 1 || got[0].BookingID != soon.ID || !slices.Equal(got[0].Sent, []notify.Kind{notify.ReminderFirst}) {
		t.Fatalf("candidates = %+v", got)
	}
}
