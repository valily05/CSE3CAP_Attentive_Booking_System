package app

import (
	"context"
	"errors"
	"slices"
	"time"

	"careconnect/internal/domain/schedule"
	"careconnect/internal/domain/wib"
	"careconnect/internal/store"
)

// ErrServiceNotOffered means the psychologist does not provide that service.
var ErrServiceNotOffered = errors.New("service not offered by this psychologist")

// SlotQuery asks for open slots.
type SlotQuery struct {
	PsychologistID, ServiceID string
	From                      time.Time // a WIB date
	Days                      int
	Mode                      string // optional: online | in_person
	LocationID                string // optional

	ignoreBooked     bool   // "would this be open if nobody had booked it?"
	excludeBookingID string // the booking being moved
}

// DaySlots is one day of open slots.
type DaySlots struct {
	Date  string          `json:"date"` // YYYY-MM-DD in WIB
	Slots []schedule.Slot `json:"slots"`
}

// Slots lists open slots day by day (G09-3: hours minus bookings, time off and blocks).
func (a *App) Slots(ctx context.Context, q SlotQuery) ([]DaySlots, error) {
	if q.Days < 1 || q.Days > 31 || !oneOf(q.Mode, "", "online", "in_person") {
		return nil, ErrBadRequest
	}
	psych, err := a.Psychologist(ctx, q.PsychologistID)
	if err != nil {
		return nil, err
	}
	if !slices.Contains(psych.ServiceIDs, q.ServiceID) {
		return nil, ErrServiceNotOffered
	}
	svc, err := a.store.GetService(ctx, q.ServiceID)
	if err != nil {
		return nil, err
	}
	st, err := a.store.Settings(ctx)
	if err != nil {
		return nil, err
	}
	from := wib.StartOfDay(q.From)
	to := from.AddDate(0, 0, q.Days)
	data, err := a.store.ScheduleRange(ctx, q.PsychologistID, from, to, q.excludeBookingID)
	if err != nil {
		return nil, err
	}
	hours := filterHours(data.Hours, q.Mode, q.LocationID)
	notBefore := a.clock.Now().Add(st.MinLead)

	out := make([]DaySlots, 0, q.Days)
	for d := from; d.Before(to); d = d.AddDate(0, 0, 1) {
		booked := data.Booked
		if q.ignoreBooked {
			booked = nil
		}
		slots := schedule.OpenSlots(schedule.Query{
			Date: d, Hours: hours, Unavailable: data.Unavailable, Booked: booked,
			Length: time.Duration(svc.LengthMinutes) * time.Minute, Break: st.Break, NotBefore: notBefore,
		})
		if slots == nil {
			slots = []schedule.Slot{}
		}
		out = append(out, DaySlots{Date: d.Format(time.DateOnly), Slots: slots})
	}
	return out, nil
}

func filterHours(hs []schedule.WeeklyHours, mode, location string) []schedule.WeeklyHours {
	var out []schedule.WeeklyHours
	for _, h := range hs {
		if (mode == "" || string(h.Mode) == mode) && (location == "" || h.LocationID == location) {
			out = append(out, h)
		}
	}
	return out
}

// nextOpenWindow is how far ahead a card looks for its next open time.
const nextOpenWindow = 21

// availability finds the earliest open slot and the open-slot count for
// each of the next seven days (from tomorrow), for the psychologist's
// shortest service.
func (a *App) availability(ctx context.Context, p store.PsychologistCard, services map[string]store.Service) (*time.Time, []DayCount, error) {
	shortest := ""
	for _, id := range p.ServiceIDs {
		if s, ok := services[id]; ok && (shortest == "" || s.LengthMinutes < services[shortest].LengthMinutes) {
			shortest = id
		}
	}
	week := []DayCount{}
	if shortest == "" {
		return nil, week, nil
	}
	days, err := a.Slots(ctx, SlotQuery{PsychologistID: p.ID, ServiceID: shortest, From: a.clock.Now(), Days: nextOpenWindow})
	if err != nil {
		return nil, nil, err
	}
	var next *time.Time
	for i, d := range days {
		if next == nil && len(d.Slots) > 0 {
			next = &d.Slots[0].Start
		}
		if i >= 1 && i <= 7 {
			week = append(week, DayCount{Date: d.Date, Count: len(d.Slots)})
		}
	}
	return next, week, nil
}
