// Package auth holds sign-in rules (G09-1).
package auth

import "time"

const (
	MaxFailures  = 5
	LockDuration = 15 * time.Minute
)

// Attempts is the failed-login state stored per account.
type Attempts struct {
	Failures    int
	LockedUntil time.Time
}

// Failed records a wrong password at now.
func (a Attempts) Failed(now time.Time) Attempts {
	if !a.LockedUntil.IsZero() && !now.Before(a.LockedUntil) {
		a = Attempts{} // previous lock expired: start counting again
	}
	a.Failures++
	if a.Failures >= MaxFailures {
		a.LockedUntil = now.Add(LockDuration)
	}
	return a
}

// Succeeded clears the counter after a correct password.
func (a Attempts) Succeeded() Attempts { return Attempts{} }

// Locked reports whether sign-in is refused at now.
func (a Attempts) Locked(now time.Time) bool { return now.Before(a.LockedUntil) }
