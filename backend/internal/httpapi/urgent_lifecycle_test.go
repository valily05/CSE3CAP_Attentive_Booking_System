package httpapi_test

import (
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"careconnect/internal/httpapi/apitest"
	"careconnect/internal/store"
)

type urgentCreated struct {
	Request store.UrgentRequest
	Token   string
}

func makeUrgent(t *testing.T, e *apitest.Env, email, mode, key string) urgentCreated {
	t.Helper()
	body := map[string]any{"customerName": "Urgent Guest", "email": email, "sessionType": mode, "acknowledged": true, "submissionKey": key}
	if mode == "onsite" {
		body["locationId"] = "jakarta"
	}
	var out urgentCreated
	if status := e.Client().Do("POST", "/api/urgent-requests", body, &out); status != 201 {
		t.Fatalf("create %d %+v", status, out)
	}
	return out
}

func TestUrgentLifecycleArrivalActivationAndRecoveryRemoved(t *testing.T) {
	e := apitest.New(t)
	e.SeedCatalog()
	admin := e.StaffUser("admin", "admin@example.test", "")
	key := strings.Repeat("a", 43)
	first := makeUrgent(t, e, "urgent@example.test", "onsite", key)
	retry := makeUrgent(t, e, "urgent@example.test", "onsite", key)
	if first.Request.ID != retry.Request.ID {
		t.Fatal("retry duplicated request")
	}
	second := makeUrgent(t, e, "urgent@example.test", "onsite", strings.Repeat("b", 43))
	if first.Request.BookingCode == second.Request.BookingCode {
		t.Fatal("repeat must have its own code")
	}
	submitted := first.Request.Workflow.SubmittedAt
	if submitted.IsZero() {
		t.Fatal("missing database timestamp")
	}
	for _, choice := range []string{"now", "10", "20", "30", "later"} {
		if status := e.Client().Do("POST", "/api/urgent-requests/arrival", map[string]string{"token": first.Token, "choice": choice}, nil); status != 204 {
			t.Fatal(status)
		}
	}
	path := "/api/admin/urgent-requests/" + first.Request.BookingCode
	for range 2 {
		if status := admin.Do("POST", path+"/check-in", map[string]any{}, nil); status != 204 {
			t.Fatal(status)
		}
	}
	var detail struct {
		Request  store.UrgentRequest
		Activity []map[string]any
	}
	if status := admin.Do("GET", path, nil, &detail); status != 200 {
		t.Fatal(status)
	}
	if detail.Request.Status != "CHECKED_IN" || detail.Request.Workflow.CheckedInAt == nil || detail.Request.Workflow.Readiness != "awaiting" || !detail.Request.Workflow.SubmittedAt.Equal(submitted) {
		t.Fatal(detail.Request)
	}
	count := 0
	for _, event := range detail.Activity {
		if event["action"] == "urgent:check-in" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("duplicate check-in events: %d", count)
	}
	if status := admin.Do("POST", path+"/guest-client", map[string]bool{"verified": false}, nil); status != 400 {
		t.Fatal(status)
	}
	if status := admin.Do("POST", path+"/guest-client", map[string]bool{"verified": true}, nil); status != 200 {
		t.Fatal(status)
	}
	if status := admin.Do("POST", path+"/invite", map[string]any{"verified": true, "consent": true, "locale": "en"}, nil); status != 204 {
		t.Fatal(status)
	}
	mails := e.Mail.To("urgent@example.test")
	activation := regexp.MustCompile(`/client-activation#([A-Za-z0-9_-]{43})`).FindStringSubmatch(mails[len(mails)-1].Text)
	if len(activation) != 2 {
		t.Fatal("activation email missing")
	}
	body := map[string]string{"token": activation[1], "password": "chosen by customer"}
	if status := e.Client().Do("POST", "/api/client-access/redeem", body, nil); status != 204 {
		t.Fatal(status)
	}
	if status := e.Client().Do("POST", "/api/client-access/redeem", body, nil); status != 404 {
		t.Fatal("activation replay", status)
	}
	client := e.Client()
	client.Login("urgent@example.test", "chosen by customer")
	if status := client.Do("GET", "/api/me/urgent-requests", nil, nil); status != 200 {
		t.Fatal(status)
	}
	if status := client.Do("GET", path, nil, nil); status != 403 {
		t.Fatal("client accessed admin", status)
	}
	if status := admin.Do("POST", path+"/change-email", map[string]any{"verified": true, "consent": true, "email": "new@example.test", "locale": "en"}, nil); status != 204 {
		t.Fatal(status)
	}
	if status := e.Client().Do("POST", "/api/auth/login", map[string]string{"email": "new@example.test", "password": "chosen by customer"}, nil); status != 401 {
		t.Fatal("unverified email replaced original", status)
	}
	changed := e.Mail.To("new@example.test")
	emailToken := regexp.MustCompile(`/client-activation#([A-Za-z0-9_-]{43})`).FindStringSubmatch(changed[len(changed)-1].Text)
	if status := e.Client().Do("POST", "/api/client-access/redeem", map[string]string{"token": emailToken[1]}, nil); status != 204 {
		t.Fatal(status)
	}
	client.Login("new@example.test", "chosen by customer")
	for _, route := range []string{"/api/urgent-requests/recovery", "/api/urgent-requests/redeem"} {
		if status := e.Client().Do("POST", route, map[string]string{"code": first.Request.BookingCode, "email": "new@example.test"}, nil); status != 404 {
			t.Fatal("removed recovery route", route, status)
		}
	}
}

func TestUrgentConcurrentConfirmationUsesExistingSchedule(t *testing.T) {
	e := apitest.New(t)
	e.SeedCatalog()
	psych := mondayOnlinePsych(e)
	admin := e.StaffUser("admin", "admin@example.test", "")
	requests := []urgentCreated{makeUrgent(t, e, "one@example.test", "online", ""), makeUrgent(t, e, "two@example.test", "online", "")}
	for _, request := range requests {
		path := "/api/admin/urgent-requests/" + request.Request.BookingCode
		if status := admin.Do("POST", path+"/guest-client", map[string]bool{"verified": true}, nil); status != 200 {
			t.Fatal(status)
		}
		if status := admin.Do("POST", path+"/confirm", map[string]any{}, nil); status != 400 {
			t.Fatal("confirmed before assignment", status)
		}
		if status := admin.Do("POST", path+"/assign", map[string]any{"psychologistId": psych, "serviceId": "adult-60", "channel": "video", "start": nextMonday9}, nil); status != 204 {
			t.Fatal(status)
		}
	}
	statuses := make([]int, 2)
	var group sync.WaitGroup
	for i := range requests {
		group.Add(1)
		go func(i int) {
			defer group.Done()
			statuses[i] = admin.Do("POST", "/api/admin/urgent-requests/"+requests[i].Request.BookingCode+"/confirm", map[string]any{}, nil)
		}(i)
	}
	group.Wait()
	won := 0
	for _, status := range statuses {
		if status == 200 {
			won++
		} else if status != 409 {
			t.Fatal(statuses)
		}
	}
	if won != 1 {
		t.Fatal("double booking", statuses)
	}
	winner := 0
	if statuses[1] == 200 {
		winner = 1
	}
	path := "/api/admin/urgent-requests/" + requests[winner].Request.BookingCode
	var first, again store.Created
	if status := admin.Do("POST", path+"/confirm", map[string]any{}, &first); status != 200 {
		t.Fatal(status)
	}
	if status := admin.Do("POST", path+"/confirm", map[string]any{}, &again); status != 200 || again.ID != first.ID {
		t.Fatal("confirmation retry changed appointment", status, first, again)
	}
	var detail struct{ Request store.UrgentRequest }
	admin.Do("GET", path, nil, &detail)
	if detail.Request.Status != "CONFIRMED" || detail.Request.Workflow.AppointmentID == "" {
		t.Fatal(detail)
	}
	var calendar struct{ Bookings []store.BookingView }
	admin.Do("GET", "/api/admin/bookings?from=2026-03-09&to=2026-03-10", nil, &calendar)
	if len(calendar.Bookings) != 1 || !calendar.Bookings[0].IsUrgent || calendar.Bookings[0].Code != requests[winner].Request.BookingCode {
		t.Fatal(calendar)
	}
	third := makeUrgent(t, e, "third@example.test", "online", "")
	thirdPath := "/api/admin/urgent-requests/" + third.Request.BookingCode
	admin.Do("POST", thirdPath+"/guest-client", map[string]bool{"verified": true}, nil)
	if status := admin.Do("POST", thirdPath+"/assign", map[string]any{"psychologistId": psych, "serviceId": "adult-60", "channel": "video", "start": nextMonday9.Add(75 * time.Minute)}, nil); status != 204 {
		t.Fatal(status)
	}
	results := make([]store.Created, 2)
	for i := range results {
		group.Add(1)
		go func(i int) {
			defer group.Done()
			if status := admin.Do("POST", thirdPath+"/confirm", map[string]any{}, &results[i]); status != 200 {
				t.Error(status)
			}
		}(i)
	}
	group.Wait()
	if results[0].ID == "" || results[0].ID != results[1].ID {
		t.Fatal("same request duplicated", results)
	}
	if count := len(e.Mail.To("third@example.test")); count != 2 {
		t.Fatalf("expected receipt plus one confirmation email, got %d", count)
	}
	e.Clock.Set(nextMonday9.Add(3 * time.Hour))
	admin.Login("admin@example.test", "staff password")
	if status := admin.Do("POST", thirdPath+"/complete", map[string]any{}, nil); status != 204 {
		t.Fatal(status)
	}
	existing := e.SignUpClient("Existing Client", "existing@example.test", false)
	var matches struct{ Clients []store.ClientSummary }
	admin.Do("GET", "/api/admin/clients?q=existing@example.test", nil, &matches)
	if len(matches.Clients) != 1 {
		t.Fatal(matches)
	}
	if status := admin.Do("POST", thirdPath+"/link-client", map[string]any{"value": matches.Clients[0].ID, "verified": true}, nil); status != 204 {
		t.Fatal(status)
	}
	var history struct{ Bookings []store.BookingView }
	existing.Do("GET", "/api/me/bookings", nil, &history)
	if len(history.Bookings) != 1 || history.Bookings[0].Code != third.Request.BookingCode || history.Bookings[0].Status != "attended" || !history.Bookings[0].IsUrgent {
		t.Fatal("future linking lost visit history", history)
	}
}
