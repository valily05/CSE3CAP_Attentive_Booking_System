package httpapi_test

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"careconnect/internal/app"
	"careconnect/internal/httpapi"
	"careconnect/internal/httpapi/apitest"
	"careconnect/internal/platform/mail"
)

type switchableSender struct {
	fail     bool
	recorder *mail.Recorder
}

func (s *switchableSender) Send(ctx context.Context, e mail.Email) error {
	if s.fail {
		return errors.New("provider unavailable")
	}
	return s.recorder.Send(ctx, e)
}

func TestVerificationDeliveryFailureCanBeResentAndAccountActivated(t *testing.T) {
	e := apitest.New(t)
	sender := &switchableSender{fail: true, recorder: e.Mail}
	application := app.New(app.Deps{Store: e.Store, Clock: e.Clock, Mail: sender, BaseURL: e.Server.URL})
	e.Server.Config.Handler = httpapi.New(application)
	c := e.Client()
	signup := map[string]any{"name": "Verification Test", "email": "verify@example.test", "phone": "081234567890", "password": "correct horse!", "country": "ID", "city": "Jakarta", "timeZone": "Asia/Jakarta", "agreedPrivacy": true, "locale": "en"}
	var out apitest.ErrorBody
	if status := c.Do("POST", "/api/auth/signup", signup, &out); status != 503 || out.Error != "email_delivery_failed" {
		t.Fatalf("signup %d %s", status, out.Error)
	}
	if status := c.Do("POST", "/api/auth/login", map[string]string{"email": "verify@example.test", "password": "correct horse!"}, nil); status != 403 {
		t.Fatal(status)
	}
	sender.fail = false
	body := map[string]string{"email": "VERIFY@example.test", "locale": "en"}
	if status := c.Do("POST", "/api/auth/resend-verification", body, nil); status != 204 {
		t.Fatal(status)
	}
	token := e.LastToken("verify@example.test")
	if status := c.Do("POST", "/api/auth/verify", map[string]string{"token": token}, nil); status != 204 {
		t.Fatal(status)
	}
	c.Login("verify@example.test", "correct horse!")
	if status := c.Do("POST", "/api/auth/verify", map[string]string{"token": token}, nil); status != 404 {
		t.Fatalf("token replay accepted: %d", status)
	}
	before := len(e.Mail.Sent())
	for _, email := range []string{"verify@example.test", "unknown@example.test"} {
		if status := c.Do("POST", "/api/auth/resend-verification", map[string]string{"email": email}, nil); status != 204 {
			t.Fatal(status)
		}
	}
	if len(e.Mail.Sent()) != before {
		t.Fatal("verified/unknown account triggered mail")
	}
}

func TestVerificationResendIsRateLimited(t *testing.T) {
	e := apitest.New(t)
	c := e.Client()
	for i := 0; i < 5; i++ {
		if status := c.Do("POST", "/api/auth/resend-verification", map[string]string{"email": "unknown@example.test"}, nil); status != http.StatusNoContent {
			t.Fatal(status)
		}
	}
	var out apitest.ErrorBody
	if status := c.Do("POST", "/api/auth/resend-verification", map[string]string{"email": "unknown@example.test"}, &out); status != 429 || out.Error != "verification_rate_limit" {
		t.Fatalf("limit %d %s", status, out.Error)
	}
}
