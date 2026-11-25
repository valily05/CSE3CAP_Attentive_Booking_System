package httpapi_test

import (
	"careconnect/internal/httpapi/apitest"
	"testing"
)

func TestPasswordResetNotice(t *testing.T) {
	e := apitest.New(t)
	c := e.SignUpClient("Reset Client", "reset-notice@example.test", false)
	if code := c.Do("POST", "/api/auth/forgot", map[string]string{"email": "reset-notice@example.test", "locale": "en"}, nil); code != 204 {
		t.Fatalf("forgot %d", code)
	}
	token := e.LastToken("reset-notice@example.test")
	var result struct {
		Email string `json:"email"`
	}
	if code := c.Do("POST", "/api/auth/reset", map[string]any{"token": token, "password": "newpassword123", "notify": true}, &result); code != 200 || result.Email != "reset-notice@example.test" {
		t.Fatalf("reset %d %+v", code, result)
	}
	c.Login("reset-notice@example.test", "newpassword123")
	if code := c.Do("POST", "/api/auth/reset", map[string]any{"token": token, "password": "anotherpassword", "notify": true}, nil); code != 404 {
		t.Fatalf("token reused %d", code)
	}
}
