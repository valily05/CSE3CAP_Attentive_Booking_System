package httpapi_test

import (
	"context"
	"fmt"
	"regexp"
	"testing"

	"careconnect/internal/app"
	"careconnect/internal/httpapi/apitest"
	"careconnect/internal/store"
)

func TestUrgentPublicValidationAndReceipt(t *testing.T) {
	e := apitest.New(t)
	c := e.Client()
	base := map[string]any{"customerName": "Rina Test", "email": "urgent@example.test", "whatsappNumber": "", "sessionType": "online", "locationId": "", "acknowledged": true}
	for _, change := range []map[string]any{
		{"submittedAt": "1900-01-01T00:00:00Z"},
		{"email": "invalid"}, {"sessionType": ""}, {"acknowledged": false},
		{"sessionType": "onsite"}, {"whatsappNumber": "123"}, {"sessionType": "online", "locationId": "unknown"},
	} {
		body := map[string]any{}
		for key, value := range base {
			body[key] = value
		}
		for key, value := range change {
			body[key] = value
		}
		// Each malformed request uses its own email to exercise validation before email throttling.
		if _, changed := change["email"]; !changed {
			body["email"] = fmt.Sprintf("invalid-%v@example.test", len(fmt.Sprint(change)))
		}
		status := c.Do("POST", "/api/urgent-requests", body, nil)
		if status != 400 {
			t.Fatalf("invalid input %v returned %d", change, status)
		}
	}
	var result struct {
		Request store.UrgentRequest
		Token   string
	}
	base["email"] = "valid@example.test"
	if status := c.Do("POST", "/api/urgent-requests", base, &result); status != 201 {
		t.Fatalf("create: %d", status)
	}
	if !regexp.MustCompile(`^ATT[0-9]{4}$`).MatchString(result.Request.BookingCode) || result.Request.Status != "PENDING" {
		t.Fatal(result.Request)
	}
	var receipt map[string]any
	if status := c.Do("POST", "/api/urgent-requests/receipt", map[string]string{"token": result.Token}, &receipt); status != 200 {
		t.Fatal(status)
	}
	if receipt["bookingCode"] != result.Request.BookingCode || receipt["email"] != nil || receipt["whatsappNumber"] != nil {
		t.Fatal(receipt)
	}
	if status := c.Do("POST", "/api/urgent-requests/receipt", map[string]string{"token": "bad"}, nil); status != 404 {
		t.Fatal(status)
	}
	if status := c.Do("GET", "/api/admin/urgent-requests", nil, nil); status != 401 {
		t.Fatal(status)
	}
}

func TestUrgentLocationUniqueCodesAndAdminProtection(t *testing.T) {
	e := apitest.New(t)
	ctx := context.Background()
	if err := e.Store.UpsertLocation(ctx, store.Location{ID: "urgent-test", Name: "Test location"}); err != nil {
		t.Fatal(err)
	}
	codes := map[string]bool{}
	for i := 0; i < 30; i++ {
		result, token, err := e.App.CreateUrgent(ctx, app.UrgentInput{
			CustomerName: "Test Request", Email: "test@example.test", SessionType: "onsite", LocationID: "urgent-test", Acknowledged: true,
		})
		if err != nil {
			t.Fatal(err)
		}
		if codes[result.BookingCode] {
			t.Fatal("duplicate code")
		}
		codes[result.BookingCode] = true
		if result.LocationName != "Test location" || len(token) != 43 {
			t.Fatal(result)
		}
		if _, err := e.App.UrgentRequests(ctx, app.Actor{Role: "client"}, "", token); err != app.ErrForbidden {
			t.Fatal(err)
		}
	}
	allowed, err := e.App.AllowUrgent(ctx, "limit-test", 1)
	if err != nil || !allowed {
		t.Fatal(allowed, err)
	}
	allowed, err = e.App.AllowUrgent(ctx, "limit-test", 1)
	if err != nil || allowed {
		t.Fatal(allowed, err)
	}
}
