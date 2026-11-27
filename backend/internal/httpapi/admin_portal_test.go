package httpapi_test

import (
	"careconnect/internal/httpapi/apitest"
	"careconnect/internal/store"
	"testing"
	"time"
)

func TestAdminPortal_BranchReportsClientsLogsAndUrgentCounts(t *testing.T) {
	e := apitest.New(t)
	e.SeedCatalog()
	admin := e.StaffUser("admin", "branch-admin@example.test", "")
	psych := e.SeedPsychologist(store.NewPsychologist{Name: "Branch Psychologist", SessionTypes: []string{"in_person", "video"}, LocationIDs: []string{"bsd", "jakarta"}, ServiceIDs: []string{"adult-60"}})
	for i, location := range []string{"bsd", "jakarta", ""} {
		var client struct{ ID string }
		address := []string{"bsd-client@example.test", "jakarta-client@example.test", "online-client@example.test"}[i]
		if status := admin.Do("POST", "/api/admin/clients", map[string]string{"name": "Branch Client " + location, "email": address, "phone": "081234567890"}, &client); status != 201 {
			t.Fatal(status)
		}
		body := map[string]any{"clientId": client.ID, "psychologistId": psych, "serviceId": "adult-60", "mode": "in_person", "locationId": location, "start": nextMonday9.Add(time.Duration(i) * 2 * time.Hour)}
		if location == "" {
			body["mode"] = "online"
			body["onlineChannel"] = "video"
		}
		if status := admin.Do("POST", "/api/bookings", body, nil); status != 201 {
			t.Fatalf("book %s %d", location, status)
		}
	}
	for _, location := range []string{"", "bsd", "jakarta", "malang"} {
		expected := 1
		if location == "" {
			expected = 3
		}
		if location == "malang" {
			expected = 0
		}
		var report struct{ Totals struct{ Sessions int } }
		if status := admin.Do("GET", "/api/admin/reports?period=week&start=2026-03-09&location="+location, nil, &report); status != 200 || report.Totals.Sessions != expected {
			t.Fatalf("report %s %d %+v", location, status, report)
		}
		var clients struct{ Clients []store.ClientSummary }
		if status := admin.Do("GET", "/api/admin/client-directory?location="+location, nil, &clients); status != 200 || len(clients.Clients) != expected {
			t.Fatalf("clients %s %d %+v", location, status, clients)
		}
		var logs struct{ Entries []store.HistoryEntry }
		if status := admin.Do("GET", "/api/admin/history?location="+location, nil, &logs); status != 200 || len(logs.Entries) != expected {
			t.Fatalf("logs %s %d %+v", location, status, logs)
		}
	}
	makeUrgent(t, e, "urgent-branch@example.test", "onsite", "")
	makeUrgent(t, e, "urgent-online@example.test", "online", "")
	for _, location := range []string{"", "jakarta", "bsd"} {
		var out struct {
			Requests []store.UrgentRequest
			Counts   map[string]int
		}
		expected := 1
		if location == "" {
			expected = 2
		}
		if location == "bsd" {
			expected = 0
		}
		if status := admin.Do("GET", "/api/admin/urgent-requests?location="+location, nil, &out); status != 200 || len(out.Requests) != expected || out.Counts["PENDING"] != expected {
			t.Fatalf("urgent %s %d %+v", location, status, out)
		}
	}
	client := e.SignUpClient("Restricted Client", "restricted@example.test", false)
	for _, path := range []string{"/api/admin/client-directory", "/api/admin/history?location=bsd", "/api/admin/reports?period=week&start=2026-03-09&location=bsd"} {
		if status := client.Do("GET", path, nil, nil); status != 403 {
			t.Fatalf("authorization %s %d", path, status)
		}
	}
}
