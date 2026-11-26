package httpapi_test

import (
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	"careconnect/internal/domain/wib"
	"careconnect/internal/httpapi/apitest"
)

type myBooking struct {
	ID        string    `json:"id"`
	Code      string    `json:"code"`
	Start     time.Time `json:"start"`
	Status    string    `json:"status"`
	CanChange bool      `json:"canChange"`
	Deadline  time.Time `json:"changeDeadline"`
}

func myBookings(t *testing.T, c *apitest.Client) []myBooking {
	t.Helper()
	var out struct {
		Bookings []myBooking `json:"bookings"`
	}
	if s := c.Do("GET", "/api/me/bookings", nil, &out); s != http.StatusOK {
		t.Fatalf("my bookings = %d", s)
	}
	return out.Bookings
}

func mondayStarts(t *testing.T, e *apitest.Env, psych string) []string {
	t.Helper()
	var got slotsResponse
	e.Client().Do("GET", "/api/psychologists/"+psych+"/slots?service=adult-60&from=2026-03-09&days=1", nil, &got)
	return got.starts()["2026-03-09"]
}

type changeWorld struct {
	e       *apitest.Env
	psych   string
	rina    *apitest.Client
	ayu     *apitest.Client
	booking created
}

func bookedMonday(t *testing.T, start time.Time) changeWorld {
	t.Helper()
	e := apitest.New(t)
	e.SeedCatalog()
	w := changeWorld{e: e, psych: mondayOnlinePsych(e)}
	w.ayu = e.StaffUser("psychologist", "ayu@attentive.test", w.psych)
	w.rina = e.SignUpClient("Rina Test", "rina@example.test", false)
	if s := w.rina.Do("POST", "/api/bookings", bookingBody(w.psych, start), &w.booking); s != http.StatusCreated {
		t.Fatalf("book = %d", s)
	}
	return w
}

var monday1130 = time.Date(2026, 3, 9, 11, 30, 0, 0, wib.Zone)

func TestCanChange_UntilEightOnTheDay(t *testing.T) {
	w := bookedMonday(t, monday1130)

	if d := myBookings(t, w.rina)[0].Deadline; !d.Equal(time.Date(2026, 3, 9, 8, 0, 0, 0, wib.Zone)) {
		t.Fatalf("changeDeadline = %v, want 08:00 WIB on the day", d)
	}
	w.e.Clock.Set(time.Date(2026, 3, 9, 7, 30, 0, 0, wib.Zone))
	if !myBookings(t, w.rina)[0].CanChange {
		t.Fatal("cannot change at 07:30 on the day")
	}
	w.e.Clock.Set(time.Date(2026, 3, 9, 8, 30, 0, 0, wib.Zone))
	if myBookings(t, w.rina)[0].CanChange {
		t.Fatal("can still change at 08:30 on the day")
	}
	var body apitest.ErrorBody
	if s := w.rina.Do("POST", "/api/bookings/"+w.booking.ID+"/cancel", map[string]string{}, &body); s != http.StatusForbidden || body.Error != "change_window_closed" {
		t.Fatalf("late cancel = %d %q", s, body.Error)
	}
}

func TestReschedule_FreesOldSlotTakesNewAndEmailsBoth(t *testing.T) {
	w := bookedMonday(t, nextMonday9)
	before := len(w.e.Mail.To("ayu@attentive.test"))

	if s := w.rina.Do("POST", "/api/bookings/"+w.booking.ID+"/reschedule", map[string]any{"start": monday1130}, nil); s != http.StatusNoContent {
		t.Fatalf("reschedule = %d", s)
	}

	if got := mondayStarts(t, w.e, w.psych); !slices.Equal(got, []string{"09:00", "10:15"}) {
		t.Fatalf("Monday slots after move = %v, want [09:00 10:15]", got)
	}
	b := myBookings(t, w.rina)[0]
	if b.Code != w.booking.Code || !b.Start.Equal(monday1130) || b.Status != "confirmed" {
		t.Fatalf("after move = %+v", b)
	}
	if len(w.e.Mail.To("ayu@attentive.test")) != before+1 {
		t.Fatal("psychologist was not told about the change")
	}
	last := w.e.Mail.To("rina@example.test")
	if subj := last[len(last)-1].Subject; subj == "" || !strings.Contains(subj, w.booking.Code) {
		t.Fatalf("client change email = %q", subj)
	}
}

func TestCancel_OpensTheSlotAndEmailsBoth(t *testing.T) {
	w := bookedMonday(t, nextMonday9)
	beforeAyu := len(w.e.Mail.To("ayu@attentive.test"))

	if s := w.rina.Do("POST", "/api/bookings/"+w.booking.ID+"/cancel", map[string]string{"reason": "schedule_conflict"}, nil); s != http.StatusNoContent {
		t.Fatalf("cancel = %d", s)
	}
	if got := mondayStarts(t, w.e, w.psych); !slices.Contains(got, "09:00") {
		t.Fatalf("09:00 not reopened: %v", got)
	}
	if myBookings(t, w.rina)[0].Status != "cancelled" {
		t.Fatal("status not cancelled")
	}
	if len(w.e.Mail.To("ayu@attentive.test")) != beforeAyu+1 {
		t.Fatal("psychologist was not told about the cancellation")
	}
}

func TestCancel_ReasonMustComeFromTheList(t *testing.T) {
	w := bookedMonday(t, nextMonday9)
	if s := w.rina.Do("POST", "/api/bookings/"+w.booking.ID+"/cancel", map[string]string{"reason": "free text about my feelings"}, nil); s != http.StatusBadRequest {
		t.Fatalf("free-text reason = %d", s)
	}
}

func TestChanges_SomeoneElsesBookingIsInvisible(t *testing.T) {
	w := bookedMonday(t, nextMonday9)
	mallory := w.e.SignUpClient("Mallory", "m@example.test", false)
	if s := mallory.Do("POST", "/api/bookings/"+w.booking.ID+"/cancel", map[string]string{}, nil); s != http.StatusNotFound {
		t.Fatalf("other client's cancel = %d", s)
	}
	if s := mallory.Do("POST", "/api/bookings/"+w.booking.ID+"/reschedule", map[string]any{"start": monday1130}, nil); s != http.StatusNotFound {
		t.Fatalf("other client's reschedule = %d", s)
	}
}

func TestReschedule_SavesMetadataAndClientNotification(t *testing.T) {
	w := bookedMonday(t, nextMonday9)
	if status := w.rina.Do("POST", "/api/bookings/"+w.booking.ID+"/reschedule", map[string]any{"start": monday1130}, nil); status != http.StatusNoContent {
		t.Fatalf("reschedule: %d", status)
	}
	var bookings struct {
		Bookings []struct {
			Code            string
			Status          string
			LastRescheduled *struct{ From, To, At time.Time }
		}
	}
	if status := w.rina.Do("GET", "/api/me/bookings", nil, &bookings); status != 200 {
		t.Fatal(status)
	}
	if len(bookings.Bookings) != 1 {
		t.Fatalf("bookings: %+v", bookings)
	}
	b := bookings.Bookings[0]
	if b.Code != w.booking.Code || b.Status != "confirmed" || b.LastRescheduled == nil {
		t.Fatalf("booking: %+v", b)
	}
	if !b.LastRescheduled.From.Equal(nextMonday9) || !b.LastRescheduled.To.Equal(monday1130) || b.LastRescheduled.At.IsZero() {
		t.Fatalf("change: %+v", b.LastRescheduled)
	}
	var notices struct {
		Items []struct {
			Kind    string
			Details struct {
				Code, BookingId string
				Start           time.Time
			}
		}
	}
	if status := w.rina.Do("GET", "/api/me/notifications", nil, &notices); status != 200 {
		t.Fatal(status)
	}
	count := 0
	for _, n := range notices.Items {
		if n.Kind == "booking_rescheduled" {
			count++
			if n.Details.Code != b.Code || n.Details.BookingId != w.booking.ID || !n.Details.Start.Equal(monday1130) {
				t.Fatalf("notification: %+v", n)
			}
		}
	}
	if count != 1 {
		t.Fatalf("reschedule notifications: %d", count)
	}
}
