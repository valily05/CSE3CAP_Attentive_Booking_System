package schedule_test

import (
	"testing"
	"time"

	"careconnect/internal/domain/schedule"
	"careconnect/internal/domain/wib"
)

// Monday 2 March 2026 in WIB.
var monday = time.Date(2026, 3, 2, 0, 0, 0, 0, wib.Zone)

func at(h, m int) time.Time {
	return monday.Add(time.Duration(h)*time.Hour + time.Duration(m)*time.Minute)
}

func starts(slots []schedule.Slot) []string {
	out := make([]string, len(slots))
	for i, s := range slots {
		out[i] = s.Start.Format("15:04")
	}
	return out
}

func assertStarts(t *testing.T, got []schedule.Slot, want ...string) {
	t.Helper()
	g := starts(got)
	if len(g) != len(want) {
		t.Fatalf("slot starts = %v, want %v", g, want)
	}
	for i := range want {
		if g[i] != want[i] {
			t.Fatalf("slot starts = %v, want %v", g, want)
		}
	}
}

func TestOpenSlots_WorkingHoursAreCutIntoServiceLengthPlusBreak(t *testing.T) {
	got := schedule.OpenSlots(schedule.Query{
		Date:   monday,
		Hours:  []schedule.WeeklyHours{{Weekday: time.Monday, Start: schedule.HM(9, 0), End: schedule.HM(12, 0), Mode: schedule.InPerson, LocationID: "bsd"}},
		Length: 60 * time.Minute,
		Break:  15 * time.Minute,
	})

	// 09:00-10:00, break, 10:15-11:15, break, 11:30-12:30 would overrun 12:00.
	assertStarts(t, got, "09:00", "10:15")
	if got[0].End != at(10, 0) || got[0].LocationID != "bsd" || got[0].Mode != schedule.InPerson {
		t.Fatalf("first slot = %+v", got[0])
	}
}

func mondayNineToNoon() schedule.Query {
	return schedule.Query{
		Date:   monday,
		Hours:  []schedule.WeeklyHours{{Weekday: time.Monday, Start: schedule.HM(9, 0), End: schedule.HM(12, 0), Mode: schedule.Online}},
		Length: 60 * time.Minute,
		Break:  15 * time.Minute,
	}
}

func TestOpenSlots_DayMarkedAsTimeOffShowsNoSlots(t *testing.T) {
	q := mondayNineToNoon()
	// Holiday 1-5 March inclusive.
	q.Unavailable = []schedule.Interval{{Start: time.Date(2026, 3, 1, 0, 0, 0, 0, wib.Zone), End: time.Date(2026, 3, 6, 0, 0, 0, 0, wib.Zone)}}

	assertStarts(t, schedule.OpenSlots(q))
}

func TestOpenSlots_BlockedHourShowsNoSlot(t *testing.T) {
	q := mondayNineToNoon()
	q.Unavailable = []schedule.Interval{{Start: at(10, 0), End: at(11, 0)}} // team meeting

	assertStarts(t, schedule.OpenSlots(q), "09:00", "11:00")
}

func TestOpenSlots_ExistingBookingKeepsBreakOnBothSides(t *testing.T) {
	q := mondayNineToNoon()
	q.Hours[0].End = schedule.HM(13, 0)
	q.Booked = []schedule.Interval{{Start: at(10, 0), End: at(11, 0)}}

	// 09:00-10:00 would leave no break before the 10:00 booking.
	// 11:15 is the first start after the booking plus a 15 minute break.
	assertStarts(t, schedule.OpenSlots(q), "11:15")
}

func TestOpenSlots_HidesSlotsStartingBeforeEarliestBookableTime(t *testing.T) {
	q := mondayNineToNoon()
	q.NotBefore = at(10, 0) // e.g. now + 24h lead time

	assertStarts(t, schedule.OpenSlots(q), "10:15")
}

func TestOpenSlots_SplitDayIsListedInTimeOrder(t *testing.T) {
	q := mondayNineToNoon()
	q.Hours = []schedule.WeeklyHours{
		{Weekday: time.Monday, Start: schedule.HM(14, 0), End: schedule.HM(15, 0), Mode: schedule.Online},
		{Weekday: time.Monday, Start: schedule.HM(9, 0), End: schedule.HM(10, 0), Mode: schedule.InPerson, LocationID: "jakarta"},
		{Weekday: time.Tuesday, Start: schedule.HM(9, 0), End: schedule.HM(10, 0), Mode: schedule.Online},
	}

	assertStarts(t, schedule.OpenSlots(q), "09:00", "14:00")
}

func TestOpenSlots_AreAlwaysInWIBEvenWhenObstaclesComeFromUTC(t *testing.T) {
	q := mondayNineToNoon()
	q.Unavailable = []schedule.Interval{{Start: at(9, 0).UTC(), End: at(10, 0).UTC()}} // as returned by Postgres

	got := schedule.OpenSlots(q)
	assertStarts(t, got, "10:00") // 11:15-12:15 would overrun 12:00
	if got[0].Start.Location() != wib.Zone {
		t.Fatalf("slot zone = %v, want WIB", got[0].Start.Location())
	}
}
