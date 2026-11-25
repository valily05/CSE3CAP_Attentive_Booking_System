package httpapi_test

import (
	"careconnect/internal/app"
	"careconnect/internal/httpapi/apitest"
	"testing"
	"time"
)

func TestClientBookingDetailsMetadataAndOwnership(t *testing.T) {
	e := apitest.New(t)
	e.SeedCatalog()
	p := mondayOnlinePsych(e)
	owner := e.SignUpClient("Actual Client", "details-client@example.test", false)
	other := e.SignUpClient("Other Client", "details-other@example.test", false)
	var first created
	if code := owner.Do("POST", "/api/bookings", bookingBody(p, nextMonday9), &first); code != 201 {
		t.Fatalf("book %d", code)
	}
	var mine struct {
		Bookings []app.ClientBooking `json:"bookings"`
	}
	if code := owner.Do("GET", "/api/me/bookings", nil, &mine); code != 200 || len(mine.Bookings) != 1 {
		t.Fatalf("list %d", code)
	}
	b := mine.Bookings[0]
	if b.BookingMethod != "self_service" || b.BookedByName != "Actual Client" || b.CreatedAt.IsZero() || b.UpdatedAt.Before(b.CreatedAt) {
		t.Fatalf("incorrect metadata %+v", b.BookingMetadata)
	}
	admin := e.StaffUser("admin", "details-admin@example.test", "")
	body := bookingBody(p, nextMonday9.Add(75*time.Minute))
	body["clientId"] = b.ClientID
	if code := admin.Do("POST", "/api/bookings", body, nil); code != 201 {
		t.Fatalf("admin book %d", code)
	}
	owner.Do("GET", "/api/me/bookings", nil, &mine)
	if len(mine.Bookings) != 2 || mine.Bookings[1].BookingMethod != "admin_assisted" {
		t.Fatal("admin method missing")
	}
	var theirs struct {
		Bookings []app.ClientBooking `json:"bookings"`
	}
	other.Do("GET", "/api/me/bookings", nil, &theirs)
	if len(theirs.Bookings) != 0 {
		t.Fatal("another client saw booking metadata")
	}
	if code := owner.Do("POST", "/api/bookings/"+first.ID+"/reschedule", map[string]any{"start": nextMonday9.Add(150 * time.Minute)}, nil); code != 204 {
		t.Fatalf("move %d", code)
	}
	owner.Do("GET", "/api/me/bookings", nil, &mine)
	for _, b := range mine.Bookings {
		if b.ID == first.ID && (b.Status != "confirmed" || b.UpdatedAt.Before(b.CreatedAt)) {
			t.Fatal("reschedule status or metadata changed incorrectly")
		}
	}
}
