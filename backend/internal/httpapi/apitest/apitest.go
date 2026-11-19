// Package apitest runs the real HTTP API against a real database, with only
// the clock and email faked (they are the system boundaries).
package apitest

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"regexp"
	"testing"
	"time"

	"careconnect/internal/app"
	"careconnect/internal/domain/auth"
	"careconnect/internal/domain/wib"
	"careconnect/internal/httpapi"
	"careconnect/internal/platform/clock"
	"careconnect/internal/platform/mail"
	"careconnect/internal/store"
	"careconnect/internal/store/storetest"
)

// Start is the default "now": Monday 2 March 2026, 09:00 WIB.
var Start = time.Date(2026, 3, 2, 9, 0, 0, 0, wib.Zone)

// Env is one running API.
type Env struct {
	t      testing.TB
	Server *httptest.Server
	Store  *store.Store
	Clock  *clock.Manual
	Mail   *mail.Recorder
	App    *app.App
}

// New starts the API on a fresh database.
func New(t testing.TB) *Env {
	t.Helper()
	e := &Env{t: t, Store: storetest.New(t), Clock: clock.NewManual(Start), Mail: &mail.Recorder{}}
	// TLS, because the session cookie is always Secure.
	e.Server = httptest.NewUnstartedServer(nil)
	e.Server.StartTLS()
	e.App = app.New(app.Deps{Store: e.Store, Clock: e.Clock, Mail: e.Mail, BaseURL: e.Server.URL})
	e.Server.Config.Handler = httpapi.New(e.App)
	t.Cleanup(e.Server.Close)
	return e
}

// Client is a browser-like client with its own cookies.
type Client struct {
	e    *Env
	http *http.Client
}

// Client returns a new anonymous client.
func (e *Env) Client() *Client {
	jar, _ := cookiejar.New(nil)
	return &Client{e: e, http: &http.Client{Jar: jar, Transport: e.Server.Client().Transport}}
}

// Do sends a JSON request and decodes a JSON response into out (if non-nil).
func (c *Client) Do(method, path string, body, out any) int {
	c.e.t.Helper()
	var r io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			c.e.t.Fatal(err)
		}
		r = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(context.Background(), method, c.e.Server.URL+path, r)
	if err != nil {
		c.e.t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		c.e.t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			c.e.t.Fatalf("%s %s: decode %q: %v", method, path, raw, err)
		}
	}
	return res.StatusCode
}

// Raw sends a request and returns status, headers and body.
func (c *Client) Raw(method, path string) (int, http.Header, []byte) {
	c.e.t.Helper()
	req, _ := http.NewRequestWithContext(context.Background(), method, c.e.Server.URL+path, nil)
	res, err := c.http.Do(req)
	if err != nil {
		c.e.t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return res.StatusCode, res.Header, b
}

// ErrorBody is the API's error shape: a stable code the UI translates.
type ErrorBody struct {
	Error string `json:"error"`
}

var tokenPattern = regexp.MustCompile(`token=([A-Za-z0-9_-]+)`)

// LastToken extracts the token from the newest email sent to addr.
func (e *Env) LastToken(addr string) string {
	e.t.Helper()
	mails := e.Mail.To(addr)
	if len(mails) == 0 {
		e.t.Fatalf("no email sent to %s", addr)
	}
	m := tokenPattern.FindStringSubmatch(mails[len(mails)-1].Text)
	if m == nil {
		e.t.Fatalf("no token link in %q", mails[len(mails)-1].Text)
	}
	return m[1]
}

// SignUpClient signs up, verifies and logs in a client.
func (e *Env) SignUpClient(name, email string, consent bool) *Client {
	e.t.Helper()
	c := e.Client()
	if s := c.Do("POST", "/api/auth/signup", map[string]any{
		"name": name, "email": email, "phone": "081234567890", "password": "correct horse",
		"agreedPrivacy": true, "checkInConsent": consent,
	}, nil); s != http.StatusCreated {
		e.t.Fatalf("signup = %d", s)
	}
	if s := c.Do("POST", "/api/auth/verify", map[string]string{"token": e.LastToken(email)}, nil); s != http.StatusNoContent {
		e.t.Fatalf("verify = %d", s)
	}
	c.Login(email, "correct horse")
	return c
}

// Login logs c in or fails the test.
func (c *Client) Login(email, password string) {
	c.e.t.Helper()
	if s := c.Do("POST", "/api/auth/login", map[string]string{"email": email, "password": password}, nil); s != http.StatusOK {
		c.e.t.Fatalf("login %s = %d", email, s)
	}
}

// StaffUser creates a verified admin or psychologist account and logs in.
// For a psychologist, psychID links the account to that profile.
func (e *Env) StaffUser(role, email, psychID string) *Client {
	e.t.Helper()
	hash, err := auth.HashPassword("staff password")
	if err != nil {
		e.t.Fatal(err)
	}
	id, err := e.Store.CreateUser(context.Background(), store.NewUser{Email: email, PasswordHash: hash, Role: role, Verified: true})
	if err != nil {
		e.t.Fatal(err)
	}
	if psychID != "" {
		if err := e.Store.LinkPsychologistUser(context.Background(), psychID, id); err != nil {
			e.t.Fatal(err)
		}
	}
	c := e.Client()
	c.Login(email, "staff password")
	return c
}

// SeedCatalog creates the three Attentive locations and three services.
func (e *Env) SeedCatalog() {
	e.t.Helper()
	ctx := context.Background()
	for _, l := range []store.Location{{ID: "jakarta", Name: "Jakarta"}, {ID: "bsd", Name: "BSD (Tangerang)"}, {ID: "malang", Name: "Malang"}} {
		if err := e.Store.UpsertLocation(ctx, l); err != nil {
			e.t.Fatal(err)
		}
	}
	for _, s := range []store.Service{
		{ID: "adult-60", Name: "Adult counseling", LengthMinutes: 60, AgeGroup: "adult"},
		{ID: "child-90", Name: "Child & teen counseling", LengthMinutes: 90, AgeGroup: "child_teen"},
		{ID: "family-120", Name: "Family & couple counseling", LengthMinutes: 120, AgeGroup: "family_couple"},
	} {
		if err := e.Store.UpsertService(ctx, s); err != nil {
			e.t.Fatal(err)
		}
	}
}

// SeedPsychologist creates an active psychologist.
func (e *Env) SeedPsychologist(p store.NewPsychologist) string {
	e.t.Helper()
	id, err := e.Store.CreatePsychologist(context.Background(), p)
	if err != nil {
		e.t.Fatal(err)
	}
	return id
}
