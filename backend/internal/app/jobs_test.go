package app_test

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"careconnect/internal/domain/booking"
	"careconnect/internal/domain/schedule"
	"careconnect/internal/domain/wib"
	"careconnect/internal/httpapi/apitest"
	"careconnect/internal/store"
)

var ctx = context.Background()

func setup(t *testing.T) (*apitest.Env, string) {
	t.Helper()
	e := apitest.New(t)
	e.SeedCatalog()
	psych := e.SeedPsychologist(store.NewPsychologist{Name: "Ayu Lestari", SessionTypes: []string{"video"}, ServiceIDs: []string{"adult-60"}})
	if err := e.Store.SetWeeklyHours(ctx, psych, []schedule.WeeklyHours{{Weekday: time.Monday, Start: schedule.HM(9, 0), End: schedule.HM(13, 0), Mode: schedule.Online}}); err != nil {
		t.Fatal(err)
	}
	return e, psych
}

func book(t *testing.T, c *apitest.Client, psych string, start time.Time) string {
	t.Helper()
	var b struct{ ID string }
	if s := c.Do("POST", "/api/bookings", map[string]any{"psychologistId": psych, "serviceId": "adult-60", "mode": "online", "onlineChannel": "video", "start": start}, &b); s != http.StatusCreated {
		t.Fatalf("book = %d", s)
	}
	return b.ID
}

func reminders(e *apitest.Env, addr string) int {
	n := 0
	for _, m := range e.Mail.To(addr) {
		if strings.HasPrefix(m.Subject, "Pengingat") || strings.HasPrefix(m.Subject, "Reminder") {
			n++
		}
	}
	return n
}

var session = time.Date(2026, 3, 9, 10, 15, 0, 0, wib.Zone) // Monday

func TestReminders_EachArrivesOnceAtTheRightTime(t *testing.T) {
	e, psych := setup(t)
	rina := e.SignUpClient("Rina Test", "rina@example.test", false)
	book(t, rina, psych, session)

	// The scheduler wakes every 15 minutes from now until the session.
	sent := map[time.Duration]int{}
	for now := apitest.Start; now.Before(session.Add(time.Hour)); now = now.Add(15 * time.Minute) {
		e.Clock.Set(now)
		before := reminders(e, "rina@example.test")
		if err := e.App.RunReminders(ctx); err != nil {
			t.Fatal(err)
		}
		if reminders(e, "rina@example.test") > before {
			sent[session.Sub(now)]++
		}
	}

	if len(sent) != 2 || sent[24*time.Hour] != 1 || sent[2*time.Hour] != 1 {
		t.Fatalf("reminders sent at (time before session → count) %v, want once at 24h and once at 2h", sent)
	}
}

func TestReminders_NoneForCancelledBookings(t *testing.T) {
	e, psych := setup(t)
	rina := e.SignUpClient("Rina Test", "rina@example.test", false)
	id := book(t, rina, psych, session)
	if s := rina.Do("POST", "/api/bookings/"+id+"/cancel", map[string]string{}, nil); s != http.StatusNoContent {
		t.Fatalf("cancel = %d", s)
	}
	for _, before := range []time.Duration{24 * time.Hour, 2 * time.Hour} {
		e.Clock.Set(session.Add(-before))
		if err := e.App.RunReminders(ctx); err != nil {
			t.Fatal(err)
		}
	}
	if n := reminders(e, "rina@example.test"); n != 0 {
		t.Fatalf("%d reminders for a cancelled booking", n)
	}
}

func TestReminder_NeverMentionsTheService(t *testing.T) {
	e, psych := setup(t)
	rina := e.SignUpClient("Rina Test", "rina@example.test", false)
	book(t, rina, psych, session)
	e.Clock.Set(session.Add(-time.Hour))
	if err := e.App.RunReminders(ctx); err != nil {
		t.Fatal(err)
	}
	for _, m := range e.Mail.To("rina@example.test") {
		if strings.Contains(m.Text, "Adult counseling") || strings.Contains(m.Subject, "Adult counseling") {
			t.Fatalf("email mentions the service:\n%s", m.Text)
		}
	}
}

func attendAndAge(t *testing.T, e *apitest.Env, c *apitest.Client, psych string) {
	t.Helper()
	id := book(t, c, psych, session)
	e.Clock.Set(session.Add(time.Hour))
	if err := e.Store.MarkAttendance(ctx, store.Attendance{BookingID: id, Status: booking.Attended, At: e.Clock.Now()}); err != nil {
		t.Fatal(err)
	}
}

func followUps(e *apitest.Env, addr string) int {
	n := 0
	for _, m := range e.Mail.To(addr) {
		if strings.Contains(m.Text, "unsubscribe?token=") {
			n++
		}
	}
	return n
}

func TestFollowUps_OnlyClientsWhoMeetEveryCondition(t *testing.T) {
	e, psych := setup(t)
	agreed := e.SignUpClient("Rina Test", "rina@example.test", true)
	notAgreed := e.SignUpClient("Budi Test", "budi@example.test", false)
	e.Clock.Set(apitest.Start)
	attendAndAge(t, e, agreed, psych)
	e.Clock.Set(apitest.Start)
	// Budi's session must be on a different slot.
	id := book(t, notAgreed, psych, session.Add(75*time.Minute))
	e.Clock.Set(session.Add(3 * time.Hour))
	if err := e.Store.MarkAttendance(ctx, store.Attendance{BookingID: id, Status: booking.Attended, At: e.Clock.Now()}); err != nil {
		t.Fatal(err)
	}

	e.Clock.Set(session.AddDate(0, 0, 59))
	must(t, e.App.RunFollowUps(ctx))
	if followUps(e, "rina@example.test") != 0 {
		t.Fatal("follow-up after only 59 days")
	}

	e.Clock.Set(session.AddDate(0, 0, 61))
	must(t, e.App.RunFollowUps(ctx))
	must(t, e.App.RunFollowUps(ctx)) // the daily job running twice must not double-send
	if got := followUps(e, "rina@example.test"); got != 1 {
		t.Fatalf("Rina got %d follow-ups, want 1", got)
	}
	if followUps(e, "budi@example.test") != 0 {
		t.Fatal("Budi never agreed to check-ins but got one")
	}
}

func TestFollowUps_UnsubscribedClientNeverGetsAnother(t *testing.T) {
	e, psych := setup(t)
	rina := e.SignUpClient("Rina Test", "rina@example.test", true)
	attendAndAge(t, e, rina, psych)
	e.Clock.Set(session.AddDate(0, 0, 61))
	must(t, e.App.RunFollowUps(ctx))

	token := e.LastToken("rina@example.test")
	if s := e.Client().Do("POST", "/api/unsubscribe", map[string]string{"token": token}, nil); s != http.StatusNoContent {
		t.Fatalf("one-click unsubscribe (no login) = %d", s)
	}
	e.Clock.Set(session.AddDate(0, 0, 200))
	must(t, e.App.RunFollowUps(ctx))
	if got := followUps(e, "rina@example.test"); got != 1 {
		t.Fatalf("follow-ups after unsubscribing = %d, want still 1", got)
	}
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
