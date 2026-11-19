package booking_test

import (
	"errors"
	"testing"
	"time"

	"careconnect/internal/domain/booking"
	"careconnect/internal/domain/wib"
)

func wibTime(day, h, m int) time.Time { return time.Date(2026, 3, day, h, m, 0, 0, wib.Zone) }

func TestCheckLeadTime(t *testing.T) {
	now := wibTime(10, 9, 0)
	cases := []struct {
		name  string
		start time.Time
		want  error
	}{
		{"in the past", wibTime(9, 14, 0), booking.ErrInPast},
		{"later today", wibTime(10, 15, 0), booking.ErrTooSoon},
		{"23h59m ahead", wibTime(11, 8, 59), booking.ErrTooSoon},
		{"exactly 24h ahead", wibTime(11, 9, 0), nil},
		{"next week", wibTime(17, 9, 0), nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if err := booking.CheckLeadTime(tc.start, now, 24*time.Hour); !errors.Is(err, tc.want) {
				t.Fatalf("CheckLeadTime() = %v, want %v", err, tc.want)
			}
		})
	}
}

func TestClientCanChange(t *testing.T) {
	cutoff := 8 * time.Hour // 08:00 WIB, admin-configurable
	cases := []struct {
		name         string
		session, now time.Time
		want         bool
	}{
		// Spec: "On the day of a 14:00 session, the client can still change it at 07:30, but not at 08:30."
		{"14:00 session, 07:30 same day", wibTime(12, 14, 0), wibTime(12, 7, 30), true},
		{"14:00 session, 08:30 same day", wibTime(12, 14, 0), wibTime(12, 8, 30), false},
		{"14:00 session, exactly 08:00", wibTime(12, 14, 0), wibTime(12, 8, 0), false},
		{"14:00 session, day before", wibTime(12, 14, 0), wibTime(11, 20, 0), true},
		// Spec: "If a session starts before 08:00, the change must be made by the end of the day before."
		{"07:00 session, 23:30 day before", wibTime(12, 7, 0), wibTime(11, 23, 30), true},
		{"07:00 session, 00:10 same day", wibTime(12, 7, 0), wibTime(12, 0, 10), false},
		{"session already over", wibTime(12, 14, 0), wibTime(12, 16, 0), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := booking.ClientCanChange(tc.session, tc.now, cutoff); got != tc.want {
				t.Fatalf("ClientCanChange() = %v, want %v", got, tc.want)
			}
		})
	}
}
