package httpapi_test

import (
	"careconnect/internal/httpapi/apitest"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestEmailVerificationNotice(t *testing.T) {
	e := apitest.New(t)
	c := e.Client()
	email := "notice@example.test"
	signup := func(address string) {
		t.Helper()
		if status := c.Do("POST", "/api/auth/signup", map[string]any{"name": "Notice Test", "email": address, "phone": "081234567890", "password": "abcdefgh", "agreedPrivacy": true, "country": "ID", "city": "Jakarta", "timeZone": "Asia/Jakarta"}, nil); status != 201 {
			t.Fatalf("signup %d", status)
		}
	}
	signup(email)
	messages := e.Mail.To(email)
	if !strings.Contains(messages[0].Text, "/verify?token=") {
		t.Fatal("verification link does not point at the return callback")
	}
	token := e.LastToken(email)
	var body map[string]string
	if status := c.Do("POST", "/api/auth/verify", map[string]any{"token": token, "notify": true}, &body); status != 200 || body["email"] != email {
		t.Fatalf("notice verification %d %+v", status, body)
	}
	c.Login(email, "abcdefgh")
	var replay map[string]string
	if status := c.Do("POST", "/api/auth/verify", map[string]any{"token": token, "notify": true}, &replay); status != http.StatusNotFound || replay["email"] != "" {
		t.Fatalf("used token returned verified identity: %d %+v", status, replay)
	}
	signup("expired-notice@example.test")
	expiredToken := e.LastToken("expired-notice@example.test")
	e.Clock.Advance(24*time.Hour + time.Second)
	var expired map[string]string
	if status := c.Do("POST", "/api/auth/verify", map[string]any{"token": expiredToken, "notify": true}, &expired); status != http.StatusNotFound || expired["email"] != "" {
		t.Fatalf("expired token returned verified identity: %d %+v", status, expired)
	}
}
