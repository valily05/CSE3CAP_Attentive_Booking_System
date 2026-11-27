package httpapi_test

import (
	"careconnect/internal/httpapi/apitest"
	"careconnect/internal/store"
	"testing"
)

func TestWelcomeNotificationLifecycle(t *testing.T) {
	e := apitest.New(t)
	guest := e.Client()
	var result struct {
		Items []store.AccountNotification `json:"items"`
	}
	if status := guest.Do("GET", "/api/me/notifications", nil, nil); status != 401 {
		t.Fatalf("anonymous %d", status)
	}
	c := e.SignUpClient("Welcome Client", "welcome@example.test", false)
	read := func() {
		t.Helper()
		if status := c.Do("GET", "/api/me/notifications", nil, &result); status != 200 {
			t.Fatalf("list %d", status)
		}
	}
	read()
	if len(result.Items) != 1 || result.Items[0].Read {
		t.Fatalf("welcome %+v", result)
	}
	id := result.Items[0].ID
	c.Login("welcome@example.test", "correct horse!")
	read()
	if len(result.Items) != 1 {
		t.Fatal("duplicate welcome")
	}
	other := e.SignUpClient("Other Client", "other@example.test", false)
	for _, action := range []string{"read", "dismiss"} {
		if status := other.Do("POST", "/api/me/notifications/"+id+"/"+action, nil, nil); status != 404 {
			t.Fatalf("ownership %s %d", action, status)
		}
	}
	if status := c.Do("POST", "/api/me/notifications/"+id+"/read", nil, nil); status != 204 {
		t.Fatalf("read %d", status)
	}
	read()
	if !result.Items[0].Read {
		t.Fatal("read not persisted")
	}
	if status := c.Do("POST", "/api/me/notifications/"+id+"/dismiss", nil, nil); status != 204 {
		t.Fatalf("dismiss %d", status)
	}
	c.Login("welcome@example.test", "correct horse!")
	read()
	if len(result.Items) != 0 {
		t.Fatal("dismissed welcome recreated")
	}
}

func TestMarkAllNotificationsReadOwnedAndIdempotent(t *testing.T) {
	e := apitest.New(t)
	if status := e.Client().Do("POST", "/api/me/notifications/read-all", nil, nil); status != 401 {
		t.Fatal(status)
	}
	c := e.SignUpClient("First Client", "first@example.test", false)
	other := e.SignUpClient("Other Client", "second@example.test", false)
	for i := 0; i < 2; i++ {
		if status := c.Do("POST", "/api/me/notifications/read-all", nil, nil); status != 204 {
			t.Fatal(status)
		}
	}
	var result struct{ Items []store.AccountNotification }
	if status := c.Do("GET", "/api/me/notifications", nil, &result); status != 200 {
		t.Fatal(status)
	}
	if len(result.Items) != 1 || !result.Items[0].Read {
		t.Fatalf("not persisted: %+v", result)
	}
	if status := other.Do("GET", "/api/me/notifications", nil, &result); status != 200 {
		t.Fatal(status)
	}
	if len(result.Items) != 1 || result.Items[0].Read {
		t.Fatalf("another account changed: %+v", result)
	}
}
