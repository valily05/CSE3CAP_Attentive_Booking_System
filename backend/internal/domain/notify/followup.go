package notify

import (
	"time"

	"careconnect/internal/domain/booking"
)

// FollowUpRules are admin settings. Inactivity is 30, 60 (default) or 90 days.
type FollowUpRules struct {
	Inactivity time.Duration
	Cooldown   time.Duration // max one follow-up per this period (30 days)
}

// FollowUpCandidate is the minimum a follow-up decision needs about a client.
type FollowUpCandidate struct {
	LastSessionAt     time.Time // zero if the client never had a session
	LastSessionStatus booking.Status
	HasUpcoming       bool
	OptedIn           bool // ticked "I agree to receive check-in emails"
	Unsubscribed      bool
	LastFollowUpAt    time.Time // zero if never sent
}

// FollowUpEligible applies every G09-8 condition. Consent is checked first:
// UU PDP forbids check-ins to clients who did not agree.
func FollowUpEligible(c FollowUpCandidate, now time.Time, r FollowUpRules) bool {
	switch {
	case !c.OptedIn || c.Unsubscribed:
		return false
	case c.LastSessionAt.IsZero() || c.LastSessionStatus != booking.Attended:
		return false
	case c.HasUpcoming:
		return false
	case now.Sub(c.LastSessionAt) < r.Inactivity:
		return false
	case !c.LastFollowUpAt.IsZero() && now.Sub(c.LastFollowUpAt) < r.Cooldown:
		return false
	}
	return true
}
