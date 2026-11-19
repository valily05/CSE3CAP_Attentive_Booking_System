package booking_test

import (
	"errors"
	"testing"
	"time"

	"careconnect/internal/domain/booking"
)

func TestTransition(t *testing.T) {
	session := wibTime(12, 14, 0)
	before, after := wibTime(12, 10, 0), wibTime(12, 15, 0)

	cases := []struct {
		name     string
		from, to booking.Status
		now      time.Time
		want     error
	}{
		{"confirmed to cancelled", booking.Confirmed, booking.Cancelled, before, nil},
		{"mark attended after it started", booking.Confirmed, booking.Attended, after, nil},
		{"mark no-show after it started", booking.Confirmed, booking.NoShow, after, nil},
		{"cannot mark attended before it happens", booking.Confirmed, booking.Attended, before, booking.ErrSessionNotStarted},
		{"cancelled is final", booking.Cancelled, booking.Confirmed, before, booking.ErrInvalidTransition},
		{"attended cannot be cancelled", booking.Attended, booking.Cancelled, after, booking.ErrInvalidTransition},
		{"admin can correct attended to no-show", booking.Attended, booking.NoShow, after, nil},
		{"unknown status", booking.Confirmed, booking.Status("teleported"), after, booking.ErrInvalidTransition},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if err := booking.Transition(tc.from, tc.to, session, tc.now); !errors.Is(err, tc.want) {
				t.Fatalf("Transition(%s→%s) = %v, want %v", tc.from, tc.to, err, tc.want)
			}
		})
	}
}
