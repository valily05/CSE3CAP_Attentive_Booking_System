package httpapi_test

import (
	"careconnect/internal/app"
	"careconnect/internal/domain/schedule"

	"careconnect/internal/httpapi/apitest"
	"careconnect/internal/store"
	"context"
	"strings"
	"testing"
	"time"
)

func waitingBody(p, date string) map[string]any {
	return map[string]any{"psychologistId": p, "serviceId": "adult-60", "date": date, "dateEnd": date, "periods": []string{"morning"}, "sessionType": "video", "locationId": ""}
}
func waitingNotices(t *testing.T, c *apitest.Client) []store.AccountNotification {
	t.Helper()
	var got struct {
		Items []store.AccountNotification `json:"items"`
	}
	if code := c.Do("GET", "/api/me/notifications", nil, &got); code != 200 {
		t.Fatalf("notices %d", code)
	}
	out := []store.AccountNotification{}
	for _, n := range got.Items {
		if n.Kind == "waiting_slot" {
			out = append(out, n)
		}
	}
	return out
}
func oneWaitingPsych(e *apitest.Env) string {
	p := e.SeedPsychologist(store.NewPsychologist{Name: "Waiting Psychologist", SessionTypes: []string{"video", "in_person"}, LocationIDs: []string{"bsd"}, ServiceIDs: []string{"adult-60"}})
	if err := e.Store.SetWeeklyHours(context.Background(), p, []schedule.WeeklyHours{{Weekday: time.Monday, Start: schedule.HM(9, 0), End: schedule.HM(10, 0), Mode: schedule.Online}}); err != nil {
		panic(err)
	}
	return p
}
func TestWaitingListCancellationMatchingAndNoReservation(t *testing.T) {
	e := apitest.New(t)
	e.SeedCatalog()
	p := oneWaitingPsych(e)
	owner := e.SignUpClient("Owner", "owner-wait@example.test", false)
	a := e.SignUpClient("A", "a-wait@example.test", false)
	b := e.SignUpClient("B", "b-wait@example.test", false)
	var booked created
	if code := owner.Do("POST", "/api/bookings", bookingBody(p, nextMonday9), &booked); code != 201 {
		t.Fatalf("initial booking %d", code)
	}
	var ar store.WaitingRequest
	for _, c := range []*apitest.Client{owner, a, b} {
		var r store.WaitingRequest
		if code := c.Do("POST", "/api/me/waiting-list", waitingBody(p, "2026-03-09"), &r); code != 201 {
			t.Fatalf("join %d %+v", code, r)
		}
		if c == a {
			ar = r
		}
		if len(waitingNotices(t, c)) != 0 {
			t.Fatal("notified for booked slot")
		}
	}
	if code := a.Do("POST", "/api/me/waiting-list", waitingBody(p, "2026-03-09"), nil); code != 409 {
		t.Fatalf("duplicate %d", code)
	}
	if code := b.Do("POST", "/api/me/waiting-list/"+ar.ID+"/remove", nil, nil); code != 404 {
		t.Fatalf("ownership %d", code)
	}
	var mine struct {
		Bookings []struct {
			Status string `json:"status"`
		} `json:"bookings"`
	}
	owner.Do("GET", "/api/me/bookings", nil, &mine)
	if len(mine.Bookings) != 1 || mine.Bookings[0].Status != "confirmed" {
		t.Fatal("joining changed booking")
	}
	if code := owner.Do("POST", "/api/bookings/"+booked.ID+"/cancel", map[string]string{"reason": "other"}, nil); code != 204 {
		t.Fatalf("cancel %d", code)
	}
	for _, c := range []*apitest.Client{owner, a, b} {
		notes := waitingNotices(t, c)
		if len(notes) != 1 {
			t.Fatalf("expected matching alert %+v", notes)
		}
		if notes[0].Details["psychologistName"] != "Waiting Psychologist" || !strings.Contains(notes[0].Details["link"].(string), "start=") {
			t.Fatal("missing actionable details")
		}
	}
	a.Do("GET", "/api/me/bookings", nil, &mine)
	if len(mine.Bookings) != 0 {
		t.Fatal("waiting auto booked")
	}
	for range 2 {
		if err := e.App.RunWaitingList(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	count := 0
	for _, m := range e.Mail.To("a-wait@example.test") {
		if strings.Contains(m.Subject, "matching your preferences") || strings.Contains(m.Subject, "sesuai preferensi") {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("duplicate/missing emails %d", count)
	}
	var alternative created
	if code := a.Do("POST", "/api/bookings", bookingBody(p, nextMonday9), &alternative); code != 201 {
		t.Fatalf("explicit booking %d", code)
	}
	if code := b.Do("POST", "/api/bookings", bookingBody(p, nextMonday9), nil); code != 409 {
		t.Fatalf("double book %d", code)
	}
	if code := a.Do("POST", "/api/me/waiting-list/"+ar.ID+"/remove", nil, nil); code != 204 {
		t.Fatalf("remove %d", code)
	}
	a.Do("POST", "/api/bookings/"+alternative.ID+"/cancel", map[string]string{"reason": "other"}, nil)
	stored, err := e.Store.WaitingRequests(context.Background(), "", false)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range stored {
		if r.ID == ar.ID {
			t.Fatal("removed request retained in database")
		}
	}
	if len(waitingNotices(t, a)) != 0 || len(waitingNotices(t, b)) != 2 {
		t.Fatal("remove or new availability event not respected")
	}
}
func TestWaitingListValidationNewHoursAndLeadTime(t *testing.T) {
	e := apitest.New(t)
	e.SeedCatalog()
	p := oneWaitingPsych(e)
	c := e.SignUpClient("Waiting", "validation-wait@example.test", false)
	if code := e.Client().Do("POST", "/api/me/waiting-list", waitingBody(p, "2026-03-09"), nil); code != 401 {
		t.Fatalf("guest %d", code)
	}
	for _, change := range []map[string]any{{"date": "2026-03-02"}, {"periods": []string{}}, {"sessionType": "voice"}, {"sessionType": "in_person", "locationId": "malang"}, {"dateEnd": "2026-05-01"}} {
		body := waitingBody(p, "2026-03-09")
		for k, v := range change {
			body[k] = v
		}
		if code := c.Do("POST", "/api/me/waiting-list", body, nil); code != 400 {
			t.Fatalf("invalid %v %d", change, code)
		}
	}
	body := waitingBody("", "2026-03-03")
	body["sessionType"] = "in_person"
	body["locationId"] = "bsd"
	if code := c.Do("POST", "/api/me/waiting-list", body, nil); code != 201 {
		t.Fatalf("anyone in-person %d", code)
	}
	if len(waitingNotices(t, c)) != 0 {
		t.Fatal("no hours yet")
	}
	hours := []schedule.WeeklyHours{{Weekday: time.Tuesday, Start: schedule.HM(9, 0), End: schedule.HM(10, 0), Mode: schedule.InPerson, LocationID: "bsd"}}
	if _, err := e.App.SetHours(context.Background(), app.Actor{Role: "admin"}, p, hours); err != nil {
		t.Fatal(err)
	}
	if len(waitingNotices(t, c)) != 1 {
		t.Fatal("opening hours did not match 24h boundary")
	}
	// Close, advance one minute, and reopen: the 23h59m slot must not trigger another alert.
	e.App.SetHours(context.Background(), app.Actor{Role: "admin"}, p, nil)
	e.Clock.Advance(time.Minute)
	e.App.SetHours(context.Background(), app.Actor{Role: "admin"}, p, hours)
	if len(waitingNotices(t, c)) != 1 {
		t.Fatal("alert inside 24h")
	}
	e.Clock.Advance(24 * time.Hour)
	if err := e.App.RunWaitingList(context.Background()); err != nil {
		t.Fatal(err)
	}
}
func TestWaitingListExplicitFulfillmentKeepsConfirmedBooking(t *testing.T) {
	e := apitest.New(t)
	e.SeedCatalog()
	p := oneWaitingPsych(e)
	c := e.SignUpClient("Fulfilled", "fulfilled-wait@example.test", false)
	var r store.WaitingRequest
	if code := c.Do("POST", "/api/me/waiting-list", waitingBody(p, "2026-03-09"), &r); code != 201 {
		t.Fatalf("join %d", code)
	}
	if code := c.Do("POST", "/api/me/waiting-list/"+r.ID+"/fulfill", nil, nil); code != 404 {
		t.Fatalf("fulfill without booking %d", code)
	}
	if code := c.Do("POST", "/api/bookings", bookingBody(p, nextMonday9), nil); code != 201 {
		t.Fatalf("book %d", code)
	}
	if code := c.Do("POST", "/api/me/waiting-list/"+r.ID+"/fulfill", nil, nil); code != 204 {
		t.Fatalf("fulfill %d", code)
	}
	var requests struct {
		Items []store.WaitingRequest `json:"items"`
	}
	c.Do("GET", "/api/me/waiting-list", nil, &requests)
	if len(requests.Items) != 0 {
		t.Fatal("completed waiting request retained")
	}
	stored, err := e.Store.WaitingRequests(context.Background(), "", false)
	if err != nil || len(stored) != 0 {
		t.Fatalf("inactive waiting history persisted: %v %+v", err, stored)
	}
	var bookings struct {
		Bookings []struct {
			Status string `json:"status"`
		} `json:"bookings"`
	}
	c.Do("GET", "/api/me/bookings", nil, &bookings)
	if len(bookings.Bookings) != 1 || bookings.Bookings[0].Status != "confirmed" {
		t.Fatal("fulfillment changed booking")
	}
}
