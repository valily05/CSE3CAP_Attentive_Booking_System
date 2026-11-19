package schedule

import (
	"errors"
	"fmt"
	"time"

	"careconnect/internal/domain/wib"
)

var (
	ErrInvalidRange      = errors.New("working hours must end after they start")
	ErrOverlappingHours  = errors.New("a psychologist cannot be in two places at the same time")
	ErrLocationRequired  = errors.New("in-person hours need a location")
	ErrOnlineHasLocation = errors.New("online hours have no location")
)

// ValidateHours checks one psychologist's full weekly pattern.
func ValidateHours(hours []WeeklyHours) error {
	for i, h := range hours {
		switch {
		case h.End <= h.Start:
			return fmt.Errorf("%s %d: %w", h.Weekday, i, ErrInvalidRange)
		case h.Mode == InPerson && h.LocationID == "":
			return fmt.Errorf("%s %d: %w", h.Weekday, i, ErrLocationRequired)
		case h.Mode == Online && h.LocationID != "":
			return fmt.Errorf("%s %d: %w", h.Weekday, i, ErrOnlineHasLocation)
		}
		for _, o := range hours[:i] {
			if o.Weekday == h.Weekday && h.Start < o.End && o.Start < h.End {
				return fmt.Errorf("%s: %w", h.Weekday, ErrOverlappingHours)
			}
		}
	}
	return nil
}

// PlacedBooking is an existing booking as far as working hours care.
type PlacedBooking struct {
	ID         string
	Start, End time.Time
	Mode       Mode
	LocationID string
}

// BookingsOutsideHours returns the IDs of bookings that no longer fit inside
// any working block. They are never deleted; the admin is warned instead.
func BookingsOutsideHours(hours []WeeklyHours, bookings []PlacedBooking) []string {
	var out []string
	for _, b := range bookings {
		if !fitsAny(hours, b) {
			out = append(out, b.ID)
		}
	}
	return out
}

func fitsAny(hours []WeeklyHours, b PlacedBooking) bool {
	day := wib.StartOfDay(b.Start)
	for _, h := range hours {
		if h.Weekday != day.Weekday() || h.Mode != b.Mode || h.LocationID != b.LocationID {
			continue
		}
		from := day.Add(time.Duration(h.Start) * time.Minute)
		to := day.Add(time.Duration(h.End) * time.Minute)
		if !b.Start.Before(from) && !b.End.After(to) {
			return true
		}
	}
	return false
}
