package store_test

import (
	"errors"
	"testing"
	"time"

	"careconnect/internal/domain/booking"
	"careconnect/internal/domain/notify"
	"careconnect/internal/store"
)

func TestFollowUpCandidates_ReportLastSessionAndConsent(t *testing.T) {
	w := seed(t, 0)
	optedIn, err := w.s.CreateClient(ctx, store.NewClient{Name: "Rina Test", Email: "rina@example.test", Phone: "0812", AgreedToMessages: true})
	must(t, err)
	_, err = w.s.CreateClient(ctx, store.NewClient{Name: "No Consent", Email: "nc@example.test", Phone: "0812"})
	must(t, err)

	b, err := w.s.CreateBooking(ctx, w.booking(optedIn, tenAM))
	must(t, err)
	must(t, w.s.MarkAttendance(ctx, store.Attendance{BookingID: b.ID, Status: booking.Attended, At: tenAM.Add(time.Hour)}))
	now := tenAM.AddDate(0, 0, 61)

	got, err := w.s.FollowUpCandidates(ctx, now)
	must(t, err)

	if len(got) != 1 {
		t.Fatalf("candidates = %+v, want only the opted-in client", got)
	}
	c := got[0]
	if c.ClientID != optedIn || c.FirstName != "Rina" || c.UnsubscribeToken == "" ||
		!c.LastSessionAt.Equal(tenAM) || c.LastSessionStatus != booking.Attended || c.HasUpcoming || !c.OptedIn {
		t.Fatalf("candidate = %+v", c)
	}
	if !notify.FollowUpEligible(c.FollowUpCandidate, now, notify.FollowUpRules{Inactivity: 60 * 24 * time.Hour, Cooldown: 30 * 24 * time.Hour}) {
		t.Fatal("expected Rina to be eligible")
	}
}

func TestUnsubscribe_OneClickByTokenStopsFollowUps(t *testing.T) {
	w := seed(t, 0)
	id, err := w.s.CreateClient(ctx, store.NewClient{Name: "Rina", Email: "rina@example.test", Phone: "0812", AgreedToMessages: true})
	must(t, err)
	b, err := w.s.CreateBooking(ctx, w.booking(id, tenAM))
	must(t, err)
	must(t, w.s.MarkAttendance(ctx, store.Attendance{BookingID: b.ID, Status: booking.Attended, At: tenAM.Add(time.Hour)}))
	now := tenAM.AddDate(0, 0, 61)
	before, err := w.s.FollowUpCandidates(ctx, now)
	must(t, err)

	must(t, w.s.Unsubscribe(ctx, before[0].UnsubscribeToken))

	after, err := w.s.FollowUpCandidates(ctx, now)
	must(t, err)
	if len(after) != 0 {
		t.Fatalf("unsubscribed client still a candidate: %+v", after)
	}
	if err := w.s.Unsubscribe(ctx, "not-a-real-token"); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("bad token = %v, want ErrNotFound", err)
	}
}
