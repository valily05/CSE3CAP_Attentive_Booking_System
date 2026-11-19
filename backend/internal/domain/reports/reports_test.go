package reports_test

import (
	"testing"

	"careconnect/internal/domain/booking"
	"careconnect/internal/domain/reports"
)

// Hand-counted fixture: 3 attended, 1 no-show, 2 cancelled, 1 upcoming.
var rows = []reports.Row{
	{Status: booking.Attended, PsychologistID: "ayu", Place: "bsd", ServiceID: "adult"},
	{Status: booking.Attended, PsychologistID: "ayu", Place: "online", ServiceID: "adult"},
	{Status: booking.Attended, PsychologistID: "budi", Place: "jakarta", ServiceID: "child"},
	{Status: booking.NoShow, PsychologistID: "ayu", Place: "bsd", ServiceID: "adult"},
	{Status: booking.Cancelled, PsychologistID: "budi", Place: "online", ServiceID: "family"},
	{Status: booking.Cancelled, PsychologistID: "ayu", Place: "bsd", ServiceID: "adult"},
	{Status: booking.Confirmed, PsychologistID: "budi", Place: "jakarta", ServiceID: "child"},
}

func TestSummarize_Totals(t *testing.T) {
	got := reports.Summarize(rows)

	want := reports.Totals{Sessions: 5, Attended: 3, NoShows: 1, Cancellations: 2, NoShowRate: 25}
	if got != want {
		t.Fatalf("Summarize() = %+v, want %+v", got, want)
	}
}

func TestSummarize_NoShowRateIsZeroWhenNothingHappenedYet(t *testing.T) {
	got := reports.Summarize([]reports.Row{{Status: booking.Confirmed}, {Status: booking.Cancelled}})
	if got.NoShowRate != 0 {
		t.Fatalf("NoShowRate = %v, want 0", got.NoShowRate)
	}
}

func TestBreakdown_ByPsychologist(t *testing.T) {
	got := reports.Breakdown(rows, reports.ByPsychologist)

	// ayu: 2 attended + 1 no-show → 33.3%; budi: 1 attended, 1 upcoming.
	if a := got["ayu"]; a.Sessions != 3 || a.Cancellations != 1 || a.NoShowRate != 33.3 {
		t.Fatalf("ayu = %+v", a)
	}
	if b := got["budi"]; b.Sessions != 2 || b.Cancellations != 1 || b.NoShowRate != 0 {
		t.Fatalf("budi = %+v", b)
	}
}

func TestBreakdown_ByPlaceTreatsOnlineAsAPlace(t *testing.T) {
	got := reports.Breakdown(rows, reports.ByPlace)
	if got["online"].Sessions != 1 || got["bsd"].Sessions != 2 || got["jakarta"].Sessions != 2 {
		t.Fatalf("by place = %+v", got)
	}
}

func TestSummarize_UnpaidOrExpiredBookingsAreNotSessions(t *testing.T) {
	// Group 05 statuses can appear in shared data; they never became sessions.
	got := reports.Summarize([]reports.Row{{Status: booking.WaitingPayment}, {Status: booking.Expired}, {Status: booking.PaidLate}, {Status: booking.Confirmed}})
	if got.Sessions != 1 {
		t.Fatalf("Sessions = %d, want 1", got.Sessions)
	}
}
