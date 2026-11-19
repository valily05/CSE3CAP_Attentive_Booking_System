package store_test

import (
	"errors"
	"testing"
	"time"

	"careconnect/internal/domain/schedule"
	"careconnect/internal/domain/wib"
	"careconnect/internal/store"
)

func slotStarts(q schedule.Query) []string {
	var out []string
	for _, s := range schedule.OpenSlots(q) {
		out = append(out, s.Start.Format("15:04"))
	}
	return out
}

func TestDaySchedule_FeedsOpenSlots(t *testing.T) {
	w := seed(t, 2)
	monday := tenAM // Monday 16 March 2026
	must(t, w.s.SetWeeklyHours(ctx, w.psychID, []schedule.WeeklyHours{
		{Weekday: time.Monday, Start: schedule.HM(9, 0), End: schedule.HM(13, 0), Mode: schedule.InPerson, LocationID: "bsd"},
		{Weekday: time.Tuesday, Start: schedule.HM(9, 0), End: schedule.HM(13, 0), Mode: schedule.InPerson, LocationID: "bsd"},
	}))
	// Block 09:00-10:00; one live booking at 10:15; one cancelled booking at 11:30.
	must(t, w.s.AddUnavailability(ctx, store.Unavailability{PsychologistID: w.psychID, Kind: "block", Start: monday.Add(-time.Hour), End: monday, Label: "Team meeting"}))
	_, err := w.s.CreateBooking(ctx, w.booking(w.clients[0], monday.Add(15*time.Minute)))
	must(t, err)
	cancelled, err := w.s.CreateBooking(ctx, w.booking(w.clients[1], monday.Add(90*time.Minute)))
	must(t, err)
	must(t, w.s.CancelBooking(ctx, store.Cancellation{BookingID: cancelled.ID}))

	day, err := w.s.DaySchedule(ctx, w.psychID, monday)
	must(t, err)
	q := schedule.Query{Date: monday, Hours: day.Hours, Unavailable: day.Unavailable, Booked: day.Booked, Length: time.Hour, Break: 15 * time.Minute}

	// 10:15-11:15 booked (+break to 11:30); cancelled 11:30 is free again.
	if got := slotStarts(q); len(got) != 1 || got[0] != "11:30" {
		t.Fatalf("open slots = %v, want [11:30]", got)
	}
}

func TestDaySchedule_TimeOffSpanningSeveralDaysEmptiesTheDay(t *testing.T) {
	w := seed(t, 0)
	must(t, w.s.SetWeeklyHours(ctx, w.psychID, []schedule.WeeklyHours{{Weekday: time.Monday, Start: schedule.HM(9, 0), End: schedule.HM(17, 0), Mode: schedule.Online}}))
	must(t, w.s.AddUnavailability(ctx, store.Unavailability{
		PsychologistID: w.psychID, Kind: "time_off", Label: "Holiday",
		Start: time.Date(2026, 3, 13, 0, 0, 0, 0, wib.Zone), End: time.Date(2026, 3, 18, 0, 0, 0, 0, wib.Zone),
	}))

	day, err := w.s.DaySchedule(ctx, w.psychID, tenAM)
	must(t, err)
	q := schedule.Query{Date: tenAM, Hours: day.Hours, Unavailable: day.Unavailable, Length: time.Hour, Break: 15 * time.Minute}
	if got := slotStarts(q); len(got) != 0 {
		t.Fatalf("open slots on a holiday = %v", got)
	}
}

func TestSetWeeklyHours_RejectsBeingInTwoPlacesAtOnce(t *testing.T) {
	w := seed(t, 0)
	err := w.s.SetWeeklyHours(ctx, w.psychID, []schedule.WeeklyHours{
		{Weekday: time.Monday, Start: schedule.HM(9, 0), End: schedule.HM(12, 0), Mode: schedule.InPerson, LocationID: "bsd"},
		{Weekday: time.Monday, Start: schedule.HM(11, 0), End: schedule.HM(14, 0), Mode: schedule.Online},
	})
	if !errors.Is(err, schedule.ErrOverlappingHours) {
		t.Fatalf("err = %v, want ErrOverlappingHours", err)
	}
}
