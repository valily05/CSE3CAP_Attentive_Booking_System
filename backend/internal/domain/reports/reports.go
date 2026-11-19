// Package reports computes admin numbers (G09-10). Rows carry no client
// identity at all, so a report cannot leak a name.
package reports

import (
	"math"

	"careconnect/internal/domain/booking"
)

// Row is one booking in the chosen period, reduced to what reports need.
type Row struct {
	Status         booking.Status
	PsychologistID string
	Place          string // a location ID, or "online"
	ServiceID      string
}

// Totals for a group of bookings.
type Totals struct {
	Sessions      int // confirmed, attended or no-show
	Attended      int
	NoShows       int
	Cancellations int
	NoShowRate    float64 // percent, one decimal place
}

// Summarize totals rows. No-show rate = no-shows ÷ (attended + no-shows) × 100.
func Summarize(rows []Row) Totals {
	var t Totals
	for _, r := range rows {
		switch r.Status {
		case booking.Cancelled:
			t.Cancellations++
			continue
		case booking.Attended:
			t.Attended++
		case booking.NoShow:
			t.NoShows++
		case booking.Confirmed:
			// upcoming session
		case booking.WaitingPayment, booking.Expired, booking.PaidLate:
			continue // never became a session
		}
		t.Sessions++
	}
	if done := t.Attended + t.NoShows; done > 0 {
		t.NoShowRate = math.Round(float64(t.NoShows)/float64(done)*1000) / 10
	}
	return t
}

// Dimension picks the key a breakdown groups by.
type Dimension func(Row) string

var (
	ByPsychologist Dimension = func(r Row) string { return r.PsychologistID }
	ByPlace        Dimension = func(r Row) string { return r.Place }
	ByService      Dimension = func(r Row) string { return r.ServiceID }
)

// Breakdown totals rows per key of dim.
func Breakdown(rows []Row, dim Dimension) map[string]Totals {
	groups := map[string][]Row{}
	for _, r := range rows {
		k := dim(r)
		groups[k] = append(groups[k], r)
	}
	out := make(map[string]Totals, len(groups))
	for k, g := range groups {
		out[k] = Summarize(g)
	}
	return out
}
