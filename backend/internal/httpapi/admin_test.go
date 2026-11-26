package httpapi_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"careconnect/internal/domain/wib"
	"careconnect/internal/httpapi/apitest"
)

func TestAdminPages_BlockedForClientsAndPsychologists(t *testing.T) {
	w := bookedMonday(t, nextMonday9)
	for _, c := range []*apitest.Client{w.rina, w.ayu} {
		for _, path := range []string{"/api/admin/bookings", "/api/admin/settings", "/api/admin/reports?period=week&start=2026-03-09", "/api/admin/history"} {
			if s := c.Do("GET", path, nil, nil); s != http.StatusForbidden {
				t.Fatalf("GET %s = %d, want 403", path, s)
			}
		}
	}
}

type adminBooking struct {
	ID         string `json:"id"`
	Code       string `json:"code"`
	ClientName string `json:"clientName"`
	Status     string `json:"status"`
}

func calendar(t *testing.T, admin *apitest.Client, query string) []adminBooking {
	t.Helper()
	var out struct {
		Bookings []adminBooking `json:"bookings"`
	}
	if s := admin.Do("GET", "/api/admin/bookings"+query, nil, &out); s != http.StatusOK {
		t.Fatalf("calendar = %d", s)
	}
	return out.Bookings
}

func TestAdmin_BooksForAWhatsAppClientAndMayBreakTheRules(t *testing.T) {
	w := bookedMonday(t, nextMonday9)
	admin := w.e.StaffUser("admin", "admin@attentive.test", "")

	var client struct{ ID string }
	if s := admin.Do("POST", "/api/admin/clients", map[string]any{"name": "Wati WhatsApp", "phone": "081298765432", "email": "wati@example.test"}, &client); s != http.StatusCreated {
		t.Fatalf("create client = %d", s)
	}
	// Today at 12:00 — well inside 24h and not on the slot grid.
	soon := time.Date(2026, 3, 2, 12, 0, 0, 0, wib.Zone)
	body := bookingBody(w.psych, soon)
	body["clientId"] = client.ID
	var b created
	if s := admin.Do("POST", "/api/bookings", body, &b); s != http.StatusCreated {
		t.Fatalf("admin booking = %d", s)
	}

	got := calendar(t, admin, "?from=2026-03-02&to=2026-03-09&psychologist="+w.psych)
	if len(got) != 2 {
		t.Fatalf("calendar = %+v", got)
	}
	names := []string{got[0].ClientName, got[1].ClientName}
	if names[0] != "Wati WhatsApp" || names[1] != "Rina Test" {
		t.Fatalf("calendar names = %v (admin sees full names)", names)
	}
	if online := calendar(t, admin, "?from=2026-03-02&to=2026-03-09&location=bsd"); len(online) != 0 {
		t.Fatalf("location filter = %+v", online)
	}

	// Two hours before the session the admin can still cancel; history records it.
	w.e.Clock.Set(soon.Add(-2 * time.Hour))
	admin.Login("admin@attentive.test", "staff password")
	if s := admin.Do("POST", "/api/bookings/"+b.ID+"/cancel", map[string]string{}, nil); s != http.StatusNoContent {
		t.Fatalf("late admin cancel = %d", s)
	}
	var hist struct {
		Entries []struct {
			Actor  string `json:"actor"`
			Action string `json:"action"`
			Code   string `json:"code"`
		} `json:"entries"`
	}
	admin.Do("GET", "/api/admin/history", nil, &hist)
	if len(hist.Entries) == 0 || hist.Entries[0].Actor != "admin@attentive.test" || hist.Entries[0].Code != b.Code || !strings.Contains(hist.Entries[0].Action, "cancelled") {
		t.Fatalf("history = %+v", hist.Entries)
	}
}

func TestAdmin_ChangingHoursWarnsAboutBookingsThatNoLongerFit(t *testing.T) {
	w := bookedMonday(t, nextMonday9)
	admin := w.e.StaffUser("admin", "admin@attentive.test", "")

	var warn struct {
		BookingsOutsideHours []string `json:"bookingsOutsideHours"`
	}
	hours := []map[string]any{{"weekday": 1, "start": "13:00", "end": "17:00", "mode": "online"}}
	if s := admin.Do("PUT", "/api/admin/psychologists/"+w.psych+"/hours", map[string]any{"hours": hours}, &warn); s != http.StatusOK {
		t.Fatalf("set hours = %d", s)
	}
	if len(warn.BookingsOutsideHours) != 1 || warn.BookingsOutsideHours[0] != w.booking.Code {
		t.Fatalf("warnings = %+v", warn)
	}
	if b := myBookings(t, w.rina); len(b) != 1 || b[0].Status != "confirmed" {
		t.Fatalf("booking must be kept, got %+v", b)
	}
}

func TestAdmin_BlocksTimeForAPsychologist(t *testing.T) {
	w := bookedMonday(t, nextMonday9)
	admin := w.e.StaffUser("admin", "admin@attentive.test", "")
	if s := admin.Do("POST", "/api/admin/psychologists/"+w.psych+"/unavailability", map[string]any{
		"kind": "block", "label": "Supervision", "start": monday1130, "end": monday1130.Add(time.Hour),
	}, nil); s != http.StatusCreated {
		t.Fatalf("block = %d", s)
	}
	if got := mondayStarts(t, w.e, w.psych); len(got) != 1 || got[0] != "10:15" {
		t.Fatalf("Monday slots = %v, want [10:15]", got)
	}
}

func TestAdmin_Settings(t *testing.T) {
	e := apitest.New(t)
	admin := e.StaffUser("admin", "admin@attentive.test", "")
	var st map[string]int
	if s := admin.Do("GET", "/api/admin/settings", nil, &st); s != http.StatusOK || st["followUpDays"] != 60 || st["changeCutoffMinute"] != 480 {
		t.Fatalf("settings = %d %v", s, st)
	}
	st["followUpDays"] = 90
	if s := admin.Do("PUT", "/api/admin/settings", st, nil); s != http.StatusNoContent {
		t.Fatalf("save = %d", s)
	}
	st["followUpDays"] = 45
	var body apitest.ErrorBody
	if s := admin.Do("PUT", "/api/admin/settings", st, &body); s != http.StatusUnprocessableEntity || body.Error != "invalid_setting" {
		t.Fatalf("45 days = %d %q", s, body.Error)
	}
}

func TestAdmin_ReportMatchesAHandCountAndHasNoNames(t *testing.T) {
	w := bookedMonday(t, nextMonday9) // Rina 09:00
	admin := w.e.StaffUser("admin", "admin@attentive.test", "")
	budi := w.e.SignUpClient("Budi Test", "budi@example.test", false)
	citra := w.e.SignUpClient("Citra Test", "citra@example.test", false)
	var b2, b3 created
	budi.Do("POST", "/api/bookings", bookingBody(w.psych, nextMonday9.Add(75*time.Minute)), &b2)
	citra.Do("POST", "/api/bookings", bookingBody(w.psych, monday1130), &b3)
	citra.Do("POST", "/api/bookings/"+b3.ID+"/cancel", map[string]string{}, nil)

	w.e.Clock.Set(monday1130.Add(2 * time.Hour))
	admin.Login("admin@attentive.test", "staff password")
	admin.Do("POST", "/api/bookings/"+w.booking.ID+"/attendance", map[string]string{"status": "attended"}, nil)
	admin.Do("POST", "/api/bookings/"+b2.ID+"/attendance", map[string]string{"status": "no_show"}, nil)

	status, _, raw := admin.Raw("GET", "/api/admin/reports?period=week&start=2026-03-09")
	if status != http.StatusOK {
		t.Fatalf("report = %d", status)
	}
	var rep struct {
		Totals struct {
			Sessions, Cancellations int
			NoShowRate              float64
		} `json:"totals"`
		ByPlace map[string]struct{ Sessions int } `json:"byPlace"`
	}
	if err := json.Unmarshal(raw, &rep); err != nil {
		t.Fatal(err)
	}
	// Hand count: 2 sessions (1 attended, 1 no-show), 1 cancellation → 50% no-show.
	if rep.Totals.Sessions != 2 || rep.Totals.Cancellations != 1 || rep.Totals.NoShowRate != 50 || rep.ByPlace["online"].Sessions != 2 {
		t.Fatalf("report = %s", raw)
	}
	for _, name := range []string{"Rina", "Budi", "Citra"} {
		if strings.Contains(string(raw), name) {
			t.Fatalf("report contains client name %q", name)
		}
	}
}

func TestAdmin_FindsClientsByNameOrPhone(t *testing.T) {
	w := bookedMonday(t, nextMonday9)
	admin := w.e.StaffUser("admin", "admin@attentive.test", "")
	var out struct {
		Clients []struct {
			ID, Name, Phone string
		} `json:"clients"`
	}
	admin.Do("GET", "/api/admin/clients?q=rina", nil, &out)
	if len(out.Clients) != 1 || out.Clients[0].Name != "Rina Test" {
		t.Fatalf("search = %+v", out)
	}
	admin.Do("GET", "/api/admin/clients?q=0812345", nil, &out)
	if len(out.Clients) != 1 {
		t.Fatalf("phone search = %+v", out)
	}
}

func TestAdminCreateClient_RejectsInvalidPhoneWithoutRequiringResidence(t *testing.T) {
	w := bookedMonday(t, nextMonday9)
	admin := w.e.StaffUser("admin", "phone-check@attentive.test", "")
	for _, phone := range []string{"", "abc", "123"} {
		var body struct{ Error string }
		status := admin.Do("POST", "/api/admin/clients", map[string]any{"name": "Walk-in Contact", "email": "walkin@example.test", "phone": phone}, &body)
		if status != http.StatusUnprocessableEntity || body.Error != "invalid_phone" {
			t.Fatalf("invalid phone %q: status=%d error=%q", phone, status, body.Error)
		}
	}
	var created struct{ ID string }
	if status := admin.Do("POST", "/api/admin/clients", map[string]any{"name": "Walk-in Contact", "email": "walkin@example.test", "phone": "+6581234567"}, &created); status != http.StatusCreated || created.ID == "" {
		t.Fatalf("valid phone without signup residence: status=%d id=%q", status, created.ID)
	}
}
