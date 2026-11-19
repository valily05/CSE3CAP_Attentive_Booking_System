// Package notify decides which messages are due (G09-6 reminders, G09-8
// follow-ups). It never sends anything itself and never sees clinical data.
package notify

import (
	"slices"
	"time"

	"careconnect/internal/domain/booking"
)

// Kind is a message type, stored in the message log.
type Kind string

const (
	ReminderFirst  Kind = "reminder_first"  // default 24h before
	ReminderSecond Kind = "reminder_second" // default 2h before
	FollowUp       Kind = "follow_up"
)

// ReminderOffsets are admin-configurable; defaults are 24h and 2h.
type ReminderOffsets struct{ First, Second time.Duration }

// ReminderCandidate is an upcoming booking and what was already sent for it.
type ReminderCandidate struct {
	BookingID string
	Start     time.Time
	Status    booking.Status
	Sent      []Kind
}

// Reminder is one email to send now.
type Reminder struct {
	BookingID string
	Kind      Kind
}

// DueReminders returns the reminders to send at now. Only the most recent
// due reminder is considered, so a client never gets an out-of-date
// "tomorrow" email after the "in 2 hours" one.
func DueReminders(cands []ReminderCandidate, now time.Time, off ReminderOffsets) []Reminder {
	var out []Reminder
	for _, c := range cands {
		if c.Status != booking.Confirmed || !now.Before(c.Start) {
			continue
		}
		var current Kind
		switch {
		case !now.Before(c.Start.Add(-off.Second)):
			current = ReminderSecond
		case !now.Before(c.Start.Add(-off.First)):
			current = ReminderFirst
		default:
			continue
		}
		if slices.Contains(c.Sent, current) || (current == ReminderFirst && slices.Contains(c.Sent, ReminderSecond)) {
			continue
		}
		out = append(out, Reminder{BookingID: c.BookingID, Kind: current})
	}
	return out
}
