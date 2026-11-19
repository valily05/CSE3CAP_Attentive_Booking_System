package notify_test

import (
	"testing"
	"time"

	"careconnect/internal/domain/booking"
	"careconnect/internal/domain/notify"
	"careconnect/internal/domain/wib"
)

func TestFollowUpEligible(t *testing.T) {
	now := time.Date(2026, 6, 1, 9, 0, 0, 0, wib.Zone)
	daysAgo := func(d int) time.Time { return now.AddDate(0, 0, -d) }
	rules := notify.FollowUpRules{Inactivity: 60 * 24 * time.Hour, Cooldown: 30 * 24 * time.Hour}

	// Rina meets every condition; each case breaks exactly one.
	rina := func() notify.FollowUpCandidate {
		return notify.FollowUpCandidate{
			LastSessionAt:     daysAgo(61),
			LastSessionStatus: booking.Attended,
			HasUpcoming:       false,
			OptedIn:           true,
			Unsubscribed:      false,
		}
	}
	cases := []struct {
		name   string
		change func(*notify.FollowUpCandidate)
		want   bool
	}{
		{"meets every condition", func(*notify.FollowUpCandidate) {}, true},
		{"exactly 60 days", func(c *notify.FollowUpCandidate) { c.LastSessionAt = daysAgo(60) }, true},
		{"only 59 days", func(c *notify.FollowUpCandidate) { c.LastSessionAt = daysAgo(59) }, false},
		{"last session was a no-show", func(c *notify.FollowUpCandidate) { c.LastSessionStatus = booking.NoShow }, false},
		{"has an upcoming booking", func(c *notify.FollowUpCandidate) { c.HasUpcoming = true }, false},
		{"never agreed to check-ins", func(c *notify.FollowUpCandidate) { c.OptedIn = false }, false},
		{"unsubscribed", func(c *notify.FollowUpCandidate) { c.Unsubscribed = true }, false},
		{"follow-up 29 days ago", func(c *notify.FollowUpCandidate) { c.LastFollowUpAt = daysAgo(29) }, false},
		{"follow-up 31 days ago", func(c *notify.FollowUpCandidate) { c.LastFollowUpAt = daysAgo(31) }, true},
		{"never had a session", func(c *notify.FollowUpCandidate) { *c = notify.FollowUpCandidate{OptedIn: true} }, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := rina()
			tc.change(&c)
			if got := notify.FollowUpEligible(c, now, rules); got != tc.want {
				t.Fatalf("FollowUpEligible() = %v, want %v", got, tc.want)
			}
		})
	}
}
