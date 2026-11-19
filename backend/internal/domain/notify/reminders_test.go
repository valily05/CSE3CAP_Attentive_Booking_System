package notify_test

import (
	"testing"
	"time"

	"careconnect/internal/domain/booking"
	"careconnect/internal/domain/notify"
	"careconnect/internal/domain/wib"
)

var session = time.Date(2026, 3, 12, 14, 0, 0, 0, wib.Zone)

func hoursBefore(h float64) time.Time { return session.Add(-time.Duration(h * float64(time.Hour))) }

var defaultOffsets = notify.ReminderOffsets{First: 24 * time.Hour, Second: 2 * time.Hour}

func TestDueReminders(t *testing.T) {
	cases := []struct {
		name   string
		status booking.Status
		sent   []notify.Kind
		now    time.Time
		want   notify.Kind // "" means nothing is due
	}{
		{"25h before: too early", booking.Confirmed, nil, hoursBefore(25), ""},
		{"23h before: first reminder", booking.Confirmed, nil, hoursBefore(23), notify.ReminderFirst},
		{"23h before, first already sent: never twice", booking.Confirmed, []notify.Kind{notify.ReminderFirst}, hoursBefore(23), ""},
		{"1h before: second reminder", booking.Confirmed, []notify.Kind{notify.ReminderFirst}, hoursBefore(1), notify.ReminderSecond},
		{"1h before, both sent", booking.Confirmed, []notify.Kind{notify.ReminderFirst, notify.ReminderSecond}, hoursBefore(1), ""},
		{"admin booked 3h ahead: only the second is ever sent", booking.Confirmed, nil, hoursBefore(1.5), notify.ReminderSecond},
		{"cancelled: never reminded", booking.Cancelled, nil, hoursBefore(1), ""},
		{"session already started", booking.Confirmed, []notify.Kind{notify.ReminderFirst}, session.Add(time.Minute), ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := notify.DueReminders([]notify.ReminderCandidate{{BookingID: "b1", Start: session, Status: tc.status, Sent: tc.sent}}, tc.now, defaultOffsets)
			switch {
			case tc.want == "" && len(got) != 0:
				t.Fatalf("got %+v, want nothing", got)
			case tc.want != "" && (len(got) != 1 || got[0].Kind != tc.want || got[0].BookingID != "b1"):
				t.Fatalf("got %+v, want one %s", got, tc.want)
			}
		})
	}
}

func TestDueReminders_SkippedFirstReminderStaysSkipped(t *testing.T) {
	// The scheduler sent the second reminder; on its next run the first one
	// is technically "due" too, but sending it now would confuse the client.
	got := notify.DueReminders([]notify.ReminderCandidate{{BookingID: "b1", Start: session, Status: booking.Confirmed, Sent: []notify.Kind{notify.ReminderSecond}}}, hoursBefore(1), defaultOffsets)
	if len(got) != 0 {
		t.Fatalf("got %+v, want nothing", got)
	}
}
