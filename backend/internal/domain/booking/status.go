package booking

import (
	"errors"
	"fmt"
	"time"
)

// Status is shared with Group 05 (Scope Update, Diagram 3). Group 09 starts
// every booking at Confirmed; WaitingPayment, Expired and PaidLate exist so
// both systems agree on the same column values.
type Status string

const (
	WaitingPayment Status = "waiting_payment"
	Confirmed      Status = "confirmed"
	Attended       Status = "attended"
	NoShow         Status = "no_show"
	Cancelled      Status = "cancelled"
	Expired        Status = "expired"
	PaidLate       Status = "paid_late"
)

var (
	ErrInvalidTransition = errors.New("booking status cannot change that way")
	ErrSessionNotStarted = errors.New("attendance can only be marked once the session has started")
)

var allowed = map[Status][]Status{
	Confirmed: {Cancelled, Attended, NoShow},
	// Corrections: staff sometimes tick the wrong box.
	Attended: {NoShow},
	NoShow:   {Attended},
}

// Transition checks a status change for a session starting at sessionStart.
func Transition(from, to Status, sessionStart, now time.Time) error {
	ok := false
	for _, s := range allowed[from] {
		if s == to {
			ok = true
			break
		}
	}
	if !ok {
		return fmt.Errorf("%s → %s: %w", from, to, ErrInvalidTransition)
	}
	if (to == Attended || to == NoShow) && now.Before(sessionStart) {
		return ErrSessionNotStarted
	}
	return nil
}
