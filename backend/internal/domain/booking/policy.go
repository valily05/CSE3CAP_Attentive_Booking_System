// Package booking holds the rules for creating and changing bookings (G09-4, G09-5).
package booking

import (
	"errors"
	"time"

	"careconnect/internal/domain/wib"
)

var (
	ErrInPast  = errors.New("cannot book a time in the past")
	ErrTooSoon = errors.New("bookings must be made in advance")
)

// CheckLeadTime enforces "book at least minLead (default 24h) before the session".
func CheckLeadTime(start, now time.Time, minLead time.Duration) error {
	switch {
	case !start.After(now):
		return ErrInPast
	case start.Sub(now) < minLead:
		return ErrTooSoon
	}
	return nil
}

// ChangeDeadline is the last moment a client may reschedule or cancel.
// It is cutoff (default 08:00) WIB on the session day, or midnight at the
// start of the session day when the session starts before the cutoff.
func ChangeDeadline(session time.Time, cutoff time.Duration) time.Time {
	day := wib.StartOfDay(session)
	deadline := day.Add(cutoff)
	if session.Before(deadline) {
		return day
	}
	return deadline
}

// ClientCanChange reports whether the client may still change the booking
// themselves. Admin staff are never limited by this.
func ClientCanChange(session, now time.Time, cutoff time.Duration) bool {
	return now.Before(ChangeDeadline(session, cutoff))
}
