// Package schedule turns a psychologist's working hours into bookable slots (G09-3).
package schedule

import (
	"sort"
	"time"

	"careconnect/internal/domain/wib"
)

// Mode is how a session takes place.
type Mode string

const (
	Online   Mode = "online"
	InPerson Mode = "in_person"
)

// Minute is a time of day expressed as minutes after midnight WIB.
type Minute int

// HM builds a Minute from hours and minutes.
func HM(h, m int) Minute { return Minute(h*60 + m) }

// WeeklyHours is one recurring working block, e.g. Monday 09:00-15:00 in BSD.
// LocationID is empty when Mode is Online.
type WeeklyHours struct {
	Weekday    time.Weekday
	Start, End Minute
	Mode       Mode
	LocationID string
}

// Interval is a half-open time range [Start, End).
type Interval struct{ Start, End time.Time }

// Slot is an open time a client can book.
type Slot struct {
	Start, End time.Time
	Mode       Mode
	LocationID string
}

// Query describes one day of one psychologist's calendar.
type Query struct {
	Date   time.Time // any instant on the wanted WIB day
	Hours  []WeeklyHours
	Length time.Duration // service length, e.g. 60, 90 or 120 minutes
	Break  time.Duration // gap kept after every session

	// Unavailable is time off and one-off blocks. No slot may overlap it.
	Unavailable []Interval
	// Booked is the psychologist's existing sessions. A slot keeps Break
	// clear on both sides of each one.
	Booked []Interval
	// NotBefore hides slots starting earlier than this (now + lead time).
	NotBefore time.Time
}

func (q Query) obstacles() []Interval {
	out := make([]Interval, 0, len(q.Unavailable)+len(q.Booked))
	out = append(out, q.Unavailable...)
	for _, b := range q.Booked {
		out = append(out, Interval{Start: b.Start.Add(-q.Break), End: b.End.Add(q.Break)})
	}
	return out
}

func (i Interval) overlaps(start, end time.Time) bool {
	return start.Before(i.End) && i.Start.Before(end)
}

// firstClash returns the obstacle overlapping [start,end) that ends last, if any.
func firstClash(obstacles []Interval, start, end time.Time) (Interval, bool) {
	var hit Interval
	found := false
	for _, o := range obstacles {
		if o.overlaps(start, end) && (!found || o.End.After(hit.End)) {
			hit, found = o, true
		}
	}
	return hit, found
}

// OpenSlots lists the bookable slots for the day, earliest first.
func OpenSlots(q Query) []Slot {
	day := wib.StartOfDay(q.Date)
	obstacles := q.obstacles()
	var slots []Slot
	for _, h := range q.Hours {
		if h.Weekday != day.Weekday() {
			continue
		}
		end := day.Add(time.Duration(h.End) * time.Minute)
		cur := day.Add(time.Duration(h.Start) * time.Minute)
		for !cur.Add(q.Length).After(end) {
			if clash, ok := firstClash(obstacles, cur, cur.Add(q.Length)); ok {
				cur = clash.End.In(wib.Zone)
				continue
			}
			if cur.Before(q.NotBefore) {
				cur = cur.Add(q.Length + q.Break)
				continue
			}
			slots = append(slots, Slot{Start: cur, End: cur.Add(q.Length), Mode: h.Mode, LocationID: h.LocationID})
			cur = cur.Add(q.Length + q.Break)
		}
	}
	sort.Slice(slots, func(i, j int) bool { return slots[i].Start.Before(slots[j].Start) })
	return slots
}
