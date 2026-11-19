package httpapi_test

import (
	"net/http"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"careconnect/internal/domain/wib"
	"careconnect/internal/httpapi/apitest"
)

// The Monday after "now"; mondayOnlinePsych works Mondays online 09:00-13:00.
var nextMonday9 = time.Date(2026, 3, 9, 9, 0, 0, 0, wib.Zone)

type created struct {
	ID             string    `json:"id"`
	Code           string    `json:"code"`
	ChangeDeadline time.Time `json:"changeDeadline"`
}

func bookingBody(psych string, start time.Time) map[string]any {
	return map[string]any{
		"psychologistId": psych, "serviceId": "adult-60",
		"mode": "online", "onlineChannel": "video", "start": start,
	}
}

func TestBook_ConfirmedRightAwayWithCodeAndEmail(t *testing.T) {
	e := apitest.New(t)
	e.SeedCatalog()
	psych := mondayOnlinePsych(e)
	rina := e.SignUpClient("Rina Test", "rina@example.test", false)

	var got created
	status := rina.Do("POST", "/api/bookings", bookingBody(psych, nextMonday9), &got)

	if status != http.StatusCreated || !regexp.MustCompile(`^ATT-[2-9A-HJKMNP-Z]{4}$`).MatchString(got.Code) {
		t.Fatalf("book = %d %+v", status, got)
	}
	if !got.ChangeDeadline.Equal(time.Date(2026, 3, 9, 8, 0, 0, 0, wib.Zone)) {
		t.Fatalf("changeDeadline = %v, want 08:00 WIB on the session day", got.ChangeDeadline)
	}
	mails := e.Mail.To("rina@example.test")
	last := mails[len(mails)-1]
	if !strings.Contains(last.Subject, got.Code) || !strings.Contains(last.Text, "Ayu") {
		t.Fatalf("confirmation email = %+v", last)
	}
	var mine struct {
		Bookings []struct {
			Code   string `json:"code"`
			Status string `json:"status"`
		} `json:"bookings"`
	}
	rina.Do("GET", "/api/me/bookings", nil, &mine)
	if len(mine.Bookings) != 1 || mine.Bookings[0].Code != got.Code || mine.Bookings[0].Status != "confirmed" {
		t.Fatalf("my bookings = %+v", mine)
	}
}

func TestBook_TwoBrowsersSameSlotOnlyOneBooking(t *testing.T) {
	e := apitest.New(t)
	e.SeedCatalog()
	psych := mondayOnlinePsych(e)
	a := e.SignUpClient("Client A", "a@example.test", false)
	b := e.SignUpClient("Client B", "b@example.test", false)

	var wg sync.WaitGroup
	statuses := make([]int, 2)
	codes := make([]apitest.ErrorBody, 2)
	for i, c := range []*apitest.Client{a, b} {
		wg.Go(func() { statuses[i] = c.Do("POST", "/api/bookings", bookingBody(psych, nextMonday9), &codes[i]) })
	}
	wg.Wait()

	won := (statuses[0] == http.StatusCreated) != (statuses[1] == http.StatusCreated)
	loser := 1
	if statuses[1] == http.StatusCreated {
		loser = 0
	}
	if !won || statuses[loser] != http.StatusConflict || codes[loser].Error != "slot_taken" {
		t.Fatalf("statuses = %v, errors = %+v", statuses, codes)
	}
}

func TestBook_Rules(t *testing.T) {
	e := apitest.New(t) // now: Monday 2 March 09:00
	e.SeedCatalog()
	psych := mondayOnlinePsych(e)
	rina := e.SignUpClient("Rina Test", "rina@example.test", false)

	cases := []struct {
		name   string
		body   map[string]any
		status int
		code   string
	}{
		{"less than a day ahead", bookingBody(psych, time.Date(2026, 3, 2, 12, 0, 0, 0, wib.Zone)), http.StatusUnprocessableEntity, "too_soon"},
		{"in the past", bookingBody(psych, time.Date(2026, 3, 1, 9, 0, 0, 0, wib.Zone)), http.StatusUnprocessableEntity, "in_past"},
		{"not an open slot (10:00 is not on the grid)", bookingBody(psych, nextMonday9.Add(time.Hour)), http.StatusConflict, "slot_unavailable"},
		{"outside working hours", bookingBody(psych, nextMonday9.Add(-2*time.Hour)), http.StatusConflict, "slot_unavailable"},
		{"online needs a channel", map[string]any{"psychologistId": psych, "serviceId": "adult-60", "mode": "online", "start": nextMonday9}, http.StatusUnprocessableEntity, "channel_required"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var body apitest.ErrorBody
			if s := rina.Do("POST", "/api/bookings", tc.body, &body); s != tc.status || body.Error != tc.code {
				t.Fatalf("got %d %q, want %d %q", s, body.Error, tc.status, tc.code)
			}
		})
	}
}

func TestBook_NeedsASignedInClient(t *testing.T) {
	e := apitest.New(t)
	e.SeedCatalog()
	psych := mondayOnlinePsych(e)
	if s := e.Client().Do("POST", "/api/bookings", bookingBody(psych, nextMonday9), nil); s != http.StatusUnauthorized {
		t.Fatalf("anonymous = %d", s)
	}
	ayu := e.StaffUser("psychologist", "ayu@attentive.test", psych)
	if s := ayu.Do("POST", "/api/bookings", bookingBody(psych, nextMonday9), nil); s != http.StatusForbidden {
		t.Fatalf("psychologist = %d", s)
	}
}
