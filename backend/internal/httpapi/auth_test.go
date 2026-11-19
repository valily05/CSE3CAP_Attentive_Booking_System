package httpapi_test

import (
	"net/http"
	"testing"
	"time"

	"careconnect/internal/httpapi/apitest"
)

type me struct {
	Role string `json:"role"`
	Name string `json:"name"`
}

func TestSignUp_ConfirmEmail_LogIn(t *testing.T) {
	e := apitest.New(t)
	c := e.Client()

	status := c.Do("POST", "/api/auth/signup", map[string]any{
		"name": "Rina Test", "email": "rina@example.test", "phone": "081234567890",
		"password": "correct horse", "agreedPrivacy": true,
	}, nil)
	if status != http.StatusCreated {
		t.Fatalf("signup = %d", status)
	}

	var e1 apitest.ErrorBody
	if s := c.Do("POST", "/api/auth/login", map[string]string{"email": "rina@example.test", "password": "correct horse"}, &e1); s != http.StatusForbidden || e1.Error != "email_not_verified" {
		t.Fatalf("login before verifying = %d %q", s, e1.Error)
	}

	if s := c.Do("POST", "/api/auth/verify", map[string]string{"token": e.LastToken("rina@example.test")}, nil); s != http.StatusNoContent {
		t.Fatalf("verify = %d", s)
	}
	c.Login("rina@example.test", "correct horse")

	var who me
	if s := c.Do("GET", "/api/auth/me", nil, &who); s != http.StatusOK || who.Role != "client" || who.Name != "Rina Test" {
		t.Fatalf("me = %d %+v", s, who)
	}
}

func TestLogin_FiveWrongPasswordsLockForFifteenMinutes(t *testing.T) {
	e := apitest.New(t)
	e.SignUpClient("Rina Test", "rina@example.test", false)
	c := e.Client()
	wrong := map[string]string{"email": "rina@example.test", "password": "wrong password"}

	for i := 1; i <= 4; i++ {
		if s := c.Do("POST", "/api/auth/login", wrong, nil); s != http.StatusUnauthorized {
			t.Fatalf("attempt %d = %d", i, s)
		}
	}
	var body apitest.ErrorBody
	if s := c.Do("POST", "/api/auth/login", wrong, &body); s != http.StatusLocked || body.Error != "account_locked" {
		t.Fatalf("5th attempt = %d %q", s, body.Error)
	}
	// Even the right password is refused while locked...
	right := map[string]string{"email": "rina@example.test", "password": "correct horse"}
	if s := c.Do("POST", "/api/auth/login", right, nil); s != http.StatusLocked {
		t.Fatalf("right password while locked = %d", s)
	}
	// ...and accepted 15 minutes later.
	e.Clock.Advance(15 * time.Minute)
	c.Login("rina@example.test", "correct horse")
}

func TestLogin_UnknownEmailLooksLikeAWrongPassword(t *testing.T) {
	e := apitest.New(t)
	var body apitest.ErrorBody
	if s := e.Client().Do("POST", "/api/auth/login", map[string]string{"email": "nobody@example.test", "password": "whatever1"}, &body); s != http.StatusUnauthorized || body.Error != "bad_credentials" {
		t.Fatalf("unknown email = %d %q", s, body.Error)
	}
}

func TestForgotPassword_ResetLinkSetsNewPasswordOnce(t *testing.T) {
	e := apitest.New(t)
	e.SignUpClient("Rina Test", "rina@example.test", false)
	c := e.Client()

	if s := c.Do("POST", "/api/auth/forgot", map[string]string{"email": "rina@example.test"}, nil); s != http.StatusNoContent {
		t.Fatalf("forgot = %d", s)
	}
	token := e.LastToken("rina@example.test")
	if s := c.Do("POST", "/api/auth/reset", map[string]string{"token": token, "password": "brand new pass"}, nil); s != http.StatusNoContent {
		t.Fatalf("reset = %d", s)
	}
	c.Login("rina@example.test", "brand new pass")
	if s := c.Do("POST", "/api/auth/reset", map[string]string{"token": token, "password": "another pass!"}, nil); s != http.StatusNotFound {
		t.Fatalf("reused reset link = %d", s)
	}
}

func TestForgotPassword_UnknownEmailStillSaysOK(t *testing.T) {
	e := apitest.New(t)
	if s := e.Client().Do("POST", "/api/auth/forgot", map[string]string{"email": "nobody@example.test"}, nil); s != http.StatusNoContent {
		t.Fatalf("forgot unknown = %d", s)
	}
	if n := len(e.Mail.Sent()); n != 0 {
		t.Fatalf("sent %d emails to an unknown address", n)
	}
}
