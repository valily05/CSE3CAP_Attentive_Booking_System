package httpapi_test

import (
	"net/http"
	"slices"
	"testing"
	"time"

	"careconnect/internal/domain/wib"
	"careconnect/internal/httpapi/apitest"
	"careconnect/internal/store"
)

type scheduleEntry struct {
	ID         string    `json:"id"`
	ClientName string    `json:"clientName"`
	Start      time.Time `json:"start"`
	Status     string    `json:"status"`
}

func mySchedule(t *testing.T, c *apitest.Client, query string) []scheduleEntry {
	t.Helper()
	var out struct {
		Bookings []scheduleEntry `json:"bookings"`
	}
	if s := c.Do("GET", "/api/psy/schedule"+query, nil, &out); s != http.StatusOK {
		t.Fatalf("schedule = %d", s)
	}
	return out.Bookings
}

func TestPsychologist_SetsHoursAndRulesAreEnforced(t *testing.T) {
	e := apitest.New(t)
	e.SeedCatalog()
	psych := e.SeedPsychologist(store.NewPsychologist{Name: "Ayu", SessionTypes: []string{"video", "in_person"}, LocationIDs: []string{"bsd"}, ServiceIDs: []string{"adult-60"}})
	ayu := e.StaffUser("psychologist", "ayu@attentive.test", psych)

	hours := []map[string]any{
		{"weekday": 1, "start": "09:00", "end": "15:00", "mode": "in_person", "locationId": "bsd"},
		{"weekday": 2, "start": "13:00", "end": "19:00", "mode": "online"},
	}
	if s := ayu.Do("PUT", "/api/psy/hours", map[string]any{"hours": hours}, nil); s != http.StatusNoContent {
		t.Fatalf("set hours = %d", s)
	}
	var got struct {
		Hours []map[string]any `json:"hours"`
	}
	ayu.Do("GET", "/api/psy/hours", nil, &got)
	if len(got.Hours) != 2 || got.Hours[0]["start"] != "09:00" || got.Hours[1]["mode"] != "online" {
		t.Fatalf("hours = %+v", got.Hours)
	}

	overlap := append(slices.Clone(hours), map[string]any{"weekday": 1, "start": "14:00", "end": "16:00", "mode": "online"})
	var body apitest.ErrorBody
	if s := ayu.Do("PUT", "/api/psy/hours", map[string]any{"hours": overlap}, &body); s != http.StatusUnprocessableEntity || body.Error != "overlapping_hours" {
		t.Fatalf("overlap = %d %q", s, body.Error)
	}
}

func TestPsychologist_TimeOffEmptiesTheDay(t *testing.T) {
	e := apitest.New(t)
	e.SeedCatalog()
	psych := mondayOnlinePsych(e)
	ayu := e.StaffUser("psychologist", "ayu@attentive.test", psych)

	if s := ayu.Do("POST", "/api/psy/unavailability", map[string]any{
		"kind": "time_off", "label": "Holiday",
		"start": time.Date(2026, 3, 9, 0, 0, 0, 0, wib.Zone), "end": time.Date(2026, 3, 14, 0, 0, 0, 0, wib.Zone),
	}, nil); s != http.StatusCreated {
		t.Fatalf("time off = %d", s)
	}
	if got := mondayStarts(t, e, psych); len(got) != 0 {
		t.Fatalf("slots during time off: %v", got)
	}
}

func TestPsychologist_SeesOnlyOwnBookingsWithFirstNamesOnly(t *testing.T) {
	w := bookedMonday(t, nextMonday9)
	other := w.e.SeedPsychologist(store.NewPsychologist{Name: "Budi", SessionTypes: []string{"video"}, ServiceIDs: []string{"adult-60"}})
	budi := w.e.StaffUser("psychologist", "budi@attentive.test", other)

	got := mySchedule(t, w.ayu, "?from=2026-03-01&to=2026-03-31")
	if len(got) != 1 || got[0].ClientName != "Rina" {
		t.Fatalf("Ayu's schedule = %+v (want one booking, first name only)", got)
	}
	if theirs := mySchedule(t, budi, "?from=2026-03-01&to=2026-03-31"); len(theirs) != 0 {
		t.Fatalf("Budi sees someone else's bookings: %+v", theirs)
	}
}

func TestPsychologist_MarksAttendanceAfterTheSession(t *testing.T) {
	w := bookedMonday(t, nextMonday9)
	id := w.booking.ID

	var body apitest.ErrorBody
	if s := w.ayu.Do("POST", "/api/bookings/"+id+"/attendance", map[string]string{"status": "attended"}, &body); s != http.StatusConflict || body.Error != "session_not_started" {
		t.Fatalf("too early = %d %q", s, body.Error)
	}
	w.e.Clock.Set(nextMonday9.Add(time.Hour))
	// A week has passed, so the 7-day sessions expired; log in again.
	w.ayu.Login("ayu@attentive.test", "staff password")
	w.rina.Login("rina@example.test", "correct horse!")
	if s := w.ayu.Do("POST", "/api/bookings/"+id+"/attendance", map[string]string{"status": "no_show"}, nil); s != http.StatusNoContent {
		t.Fatalf("mark = %d", s)
	}
	if b := myBookings(t, w.rina)[0]; b.Status != "no_show" {
		t.Fatalf("client sees status %q", b.Status)
	}
	if s := w.rina.Do("POST", "/api/bookings/"+id+"/attendance", map[string]string{"status": "attended"}, nil); s != http.StatusForbidden {
		t.Fatalf("client marking own attendance = %d", s)
	}
	if got := mySchedule(t, w.ayu, "?status=no_show"); len(got) != 1 {
		t.Fatalf("status filter = %+v", got)
	}
}

func TestPsychologist_PagesAreNotForClients(t *testing.T) {
	w := bookedMonday(t, nextMonday9)
	for _, path := range []string{"/api/psy/schedule", "/api/psy/hours"} {
		if s := w.rina.Do("GET", path, nil, nil); s != http.StatusForbidden {
			t.Fatalf("client GET %s = %d", path, s)
		}
	}
}
