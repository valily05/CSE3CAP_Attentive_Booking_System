package httpapi_test

import (
	"careconnect/internal/app"
	"careconnect/internal/httpapi/apitest"
	"net/http"
	"testing"
)

func TestRegistrationRecovery_DuplicateResendAndResidenceReview(t *testing.T) {
	e := apitest.New(t)
	c := e.Client()
	email := "recovery@example.test"
	original := map[string]any{"name": "Recovery Client", "email": email, "phone": "081234567890", "password": "abcdefgh", "agreedPrivacy": true, "country": "ID", "city": "Jakarta", "timeZone": "Asia/Jakarta"}
	if code := c.Do("POST", "/api/auth/signup", original, nil); code != 201 {
		t.Fatalf("signup %d", code)
	}
	retry := map[string]any{"name": "Changed Name", "email": email, "phone": "+61412345678", "password": "different-password", "agreedPrivacy": true, "country": "AU", "city": "Perth", "timeZone": "Australia/Perth"}
	var problem apitest.ErrorBody
	if code := c.Do("POST", "/api/auth/signup", retry, &problem); code != 409 || problem.Error != "account_unverified" {
		t.Fatalf("unverified duplicate %d %+v", code, problem)
	}
	if len(e.Mail.Sent()) != 1 {
		t.Fatal("duplicate signup sent another email")
	}
	if code := c.Do("POST", "/api/auth/resend-verification", map[string]string{"email": email, "locale": "en"}, nil); code != 204 {
		t.Fatalf("resend %d", code)
	}
	if len(e.Mail.Sent()) != 2 {
		t.Fatal("resend did not send exactly one email")
	}
	if code := c.Do("PUT", "/api/me/residence", map[string]string{"country": "AU", "city": "Perth", "timeZone": "Australia/Perth"}, nil); code != http.StatusUnauthorized {
		t.Fatalf("anonymous update %d", code)
	}
	if code := c.Do("POST", "/api/auth/verify", map[string]string{"token": e.LastToken(email)}, nil); code != 204 {
		t.Fatalf("verify %d", code)
	}
	c.Login(email, "abcdefgh")
	var current app.Residence
	if code := c.Do("GET", "/api/me/residence", nil, &current); code != 200 || current.Country != "ID" || current.City != "Jakarta" {
		t.Fatalf("residence overwritten before review: %d %+v", code, current)
	}
	if code := c.Do("PUT", "/api/me/residence", map[string]string{"country": "AU", "city": "Perth", "timeZone": "Asia/Tokyo"}, nil); code != 422 {
		t.Fatalf("invalid zone accepted %d", code)
	}
	if code := c.Do("PUT", "/api/me/residence", map[string]string{"country": "AU", "city": "Perth", "timeZone": "Australia/Perth"}, nil); code != 204 {
		t.Fatalf("save residence %d", code)
	}
	if code := c.Do("GET", "/api/me/residence", nil, &current); code != 200 || current.Country != "AU" || current.City != "Perth" || current.TimeZone != "Australia/Perth" {
		t.Fatalf("residence not saved: %d %+v", code, current)
	}
	if code := c.Do("POST", "/api/auth/signup", retry, &problem); code != 409 || problem.Error != "email_taken" {
		t.Fatalf("verified duplicate %d %+v", code, problem)
	}
	before := len(e.Mail.Sent())
	c.Do("POST", "/api/auth/resend-verification", map[string]string{"email": email, "locale": "en"}, nil)
	if len(e.Mail.Sent()) != before {
		t.Fatal("verified account was emailed again")
	}
}
