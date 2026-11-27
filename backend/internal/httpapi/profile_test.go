package httpapi_test

import (
	"careconnect/internal/httpapi/apitest"
	"careconnect/internal/store"
	"testing"
	"time"
)

func TestProfile_UpdateOwnedDetailsAndValidate(t *testing.T) {
	e := apitest.New(t)
	guest := e.Client()
	if s := guest.Do("GET", "/api/me/profile", nil, nil); s != 401 {
		t.Fatal(s)
	}
	c := e.SignUpClient("Profile Client", "profile@example.test", false)
	other := e.SignUpClient("Other Client", "profile-other@example.test", false)
	body := map[string]any{"name": "Updated Name", "phone": "+6581234567", "country": "SG", "otherCountry": "", "city": "Singapore", "timeZone": "Asia/Singapore", "email": "ignored@example.test"}
	if s := c.Do("PUT", "/api/me/profile", body, nil); s != 204 {
		t.Fatal(s)
	}
	var p store.ClientProfile
	if s := c.Do("GET", "/api/me/profile", nil, &p); s != 200 || p.Name != "Updated Name" || p.Phone != "+6581234567" || p.Country != "SG" || p.Email != "profile@example.test" {
		t.Fatalf("profile %d %+v", s, p)
	}
	if s := other.Do("GET", "/api/me/profile", nil, &p); s != 200 || p.Name != "Other Client" {
		t.Fatalf("ownership %d %+v", s, p)
	}
	body["phone"] = "123"
	if s := c.Do("PUT", "/api/me/profile", body, nil); s != 422 {
		t.Fatalf("invalid phone %d", s)
	}
	body["phone"] = "+6581234567"
	body["timeZone"] = "Asia/Tokyo"
	if s := c.Do("PUT", "/api/me/profile", body, nil); s != 422 {
		t.Fatalf("invalid residence %d", s)
	}
}
func TestProfile_EmailChangeRequiresPasswordAndVerifiedSingleUseLink(t *testing.T) {
	e := apitest.New(t)
	c := e.SignUpClient("Email Client", "old@example.test", false)
	e.SignUpClient("Taken Client", "taken@example.test", false)
	path := "/api/me/profile/email"
	if s := c.Do("POST", path, map[string]string{"email": "new@example.test", "currentPassword": "wrong"}, nil); s != 401 {
		t.Fatalf("wrong password %d", s)
	}
	if s := c.Do("POST", path, map[string]string{"email": "taken@example.test", "currentPassword": "correct horse!"}, nil); s != 409 {
		t.Fatalf("duplicate %d", s)
	}
	if s := c.Do("POST", path, map[string]string{"email": "new@example.test", "currentPassword": "correct horse!", "locale": "en"}, nil); s != 204 {
		t.Fatalf("request %d", s)
	}
	token := e.LastToken("new@example.test")
	var p store.ClientProfile
	c.Do("GET", "/api/me/profile", nil, &p)
	if p.Email != "old@example.test" || p.PendingEmail != "new@example.test" {
		t.Fatalf("premature change %+v", p)
	}
	if s := e.Client().Do("POST", "/api/auth/verify", map[string]string{"token": token}, nil); s != 204 {
		t.Fatalf("verify %d", s)
	}
	if s := c.Do("GET", "/api/me/profile", nil, nil); s != 401 {
		t.Fatalf("old session survived %d", s)
	}
	if s := e.Client().Do("POST", "/api/auth/verify", map[string]string{"token": token}, nil); s != 404 {
		t.Fatalf("replay %d", s)
	}
	fresh := e.Client()
	if s := fresh.Do("POST", "/api/auth/login", map[string]string{"email": "new@example.test", "password": "correct horse!"}, nil); s != 200 {
		t.Fatalf("new login %d", s)
	}
	fresh.Do("GET", "/api/me/profile", nil, &p)
	if p.Email != "new@example.test" || p.PendingEmail != "" {
		t.Fatalf("changed %+v", p)
	}
}
func TestProfile_EmailChangeExpiresAndLatestLinkWins(t *testing.T) {
	e := apitest.New(t)
	c := e.SignUpClient("Email Client", "expiry@example.test", false)
	request := func(email string) {
		t.Helper()
		if s := c.Do("POST", "/api/me/profile/email", map[string]string{"email": email, "currentPassword": "correct horse!"}, nil); s != 204 {
			t.Fatal(s)
		}
	}
	request("first@example.test")
	old := e.LastToken("first@example.test")
	request("latest@example.test")
	latest := e.LastToken("latest@example.test")
	if s := e.Client().Do("POST", "/api/auth/verify", map[string]string{"token": old}, nil); s != 404 {
		t.Fatalf("old link %d", s)
	}
	e.Clock.Set(e.Clock.Now().Add(25 * time.Hour))
	if s := e.Client().Do("POST", "/api/auth/verify", map[string]string{"token": latest}, nil); s != 404 {
		t.Fatalf("expired %d", s)
	}
}
func TestProfile_PasswordChangeRequiresCurrentPasswordAndRevokesSessions(t *testing.T) {
	e := apitest.New(t)
	c := e.SignUpClient("Password Client", "password@example.test", false)
	path := "/api/me/profile/password"
	if s := c.Do("POST", path, map[string]string{"currentPassword": "wrong", "password": "new password!"}, nil); s != 401 {
		t.Fatal(s)
	}
	if s := c.Do("POST", path, map[string]string{"currentPassword": "correct horse!", "password": "short"}, nil); s != 422 {
		t.Fatal(s)
	}
	if s := c.Do("POST", path, map[string]string{"currentPassword": "correct horse!", "password": "new password!"}, nil); s != 204 {
		t.Fatal(s)
	}
	if s := c.Do("GET", "/api/me/profile", nil, nil); s != 401 {
		t.Fatalf("session not revoked %d", s)
	}
	if s := e.Client().Do("POST", "/api/auth/login", map[string]string{"email": "password@example.test", "password": "new password!"}, nil); s != 200 {
		t.Fatalf("new password %d", s)
	}
}
