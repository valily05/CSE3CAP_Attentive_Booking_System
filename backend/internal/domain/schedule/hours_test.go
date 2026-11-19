package schedule_test

import (
	"errors"
	"testing"
	"time"

	"careconnect/internal/domain/schedule"
)

func TestValidateHours(t *testing.T) {
	bsd := func(d time.Weekday, from, to schedule.Minute) schedule.WeeklyHours {
		return schedule.WeeklyHours{Weekday: d, Start: from, End: to, Mode: schedule.InPerson, LocationID: "bsd"}
	}
	online := func(d time.Weekday, from, to schedule.Minute) schedule.WeeklyHours {
		return schedule.WeeklyHours{Weekday: d, Start: from, End: to, Mode: schedule.Online}
	}

	cases := []struct {
		name  string
		hours []schedule.WeeklyHours
		want  error
	}{
		{"spec example is valid", []schedule.WeeklyHours{bsd(time.Monday, schedule.HM(9, 0), schedule.HM(15, 0)), online(time.Tuesday, schedule.HM(13, 0), schedule.HM(19, 0))}, nil},
		{"back-to-back blocks are fine", []schedule.WeeklyHours{bsd(time.Monday, schedule.HM(9, 0), schedule.HM(12, 0)), online(time.Monday, schedule.HM(12, 0), schedule.HM(15, 0))}, nil},
		{"two places at once", []schedule.WeeklyHours{bsd(time.Monday, schedule.HM(9, 0), schedule.HM(12, 0)), online(time.Monday, schedule.HM(11, 0), schedule.HM(13, 0))}, schedule.ErrOverlappingHours},
		{"end before start", []schedule.WeeklyHours{bsd(time.Monday, schedule.HM(15, 0), schedule.HM(9, 0))}, schedule.ErrInvalidRange},
		{"in person needs a place", []schedule.WeeklyHours{{Weekday: time.Monday, Start: schedule.HM(9, 0), End: schedule.HM(10, 0), Mode: schedule.InPerson}}, schedule.ErrLocationRequired},
		{"online has no place", []schedule.WeeklyHours{{Weekday: time.Monday, Start: schedule.HM(9, 0), End: schedule.HM(10, 0), Mode: schedule.Online, LocationID: "bsd"}}, schedule.ErrOnlineHasLocation},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if err := schedule.ValidateHours(tc.hours); !errors.Is(err, tc.want) {
				t.Fatalf("ValidateHours() = %v, want %v", err, tc.want)
			}
		})
	}
}

func TestBookingsOutsideHours_FlagsOnlyBookingsThatNoLongerFit(t *testing.T) {
	newHours := []schedule.WeeklyHours{{Weekday: time.Monday, Start: schedule.HM(9, 0), End: schedule.HM(12, 0), Mode: schedule.Online}}
	bookings := []schedule.PlacedBooking{
		{ID: "fits", Start: at(9, 0), End: at(10, 0), Mode: schedule.Online},
		{ID: "runs-past-noon", Start: at(11, 30), End: at(12, 30), Mode: schedule.Online},
		{ID: "wrong-mode", Start: at(10, 15), End: at(11, 15), Mode: schedule.InPerson, LocationID: "bsd"},
		{ID: "tuesday", Start: at(24+9, 0), End: at(24+10, 0), Mode: schedule.Online},
	}

	got := schedule.BookingsOutsideHours(newHours, bookings)

	want := []string{"runs-past-noon", "wrong-mode", "tuesday"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}
