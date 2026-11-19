// Package app holds the use cases. It joins domain rules, the store, the
// clock and email; HTTP handlers and background jobs only call into here.
package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"log/slog"

	"careconnect/internal/email"
	"careconnect/internal/platform/clock"
	"careconnect/internal/platform/mail"
	"careconnect/internal/store"
)

// Errors the HTTP layer turns into stable codes.
var (
	ErrBadCredentials     = errors.New("email or password is wrong")
	ErrLocked             = errors.New("account locked")
	ErrEmailNotVerified   = errors.New("email not verified")
	ErrUnauthenticated    = errors.New("not signed in")
	ErrForbidden          = errors.New("not allowed")
	ErrBadRequest         = errors.New("bad request")
	ErrSlotUnavailable    = errors.New("that time is not an open slot")
	ErrChangeWindowClosed = errors.New("please contact our admin")
)

// Deps are the outside pieces an App needs.
type Deps struct {
	Store   *store.Store
	Clock   clock.Clock
	Mail    mail.Sender
	BaseURL string // public URL of the website, for links in emails
	Log     *slog.Logger
}

// App is the application.
type App struct {
	store *store.Store
	clock clock.Clock
	mail  mail.Sender
	base  string
	log   *slog.Logger
}

// New builds an App.
func New(d Deps) *App {
	if d.Log == nil {
		d.Log = slog.Default()
	}
	return &App{store: d.Store, clock: d.Clock, mail: d.Mail, base: d.BaseURL, log: d.Log}
}

// Actor is whoever is making a request.
type Actor struct {
	UserID         string
	Role           string // client | psychologist | admin
	ClientID       string
	PsychologistID string
}

// IsAdmin reports whether the actor is admin staff.
func (a Actor) IsAdmin() bool { return a.Role == "admin" }

func newToken() (raw string, hash []byte, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", nil, err
	}
	raw = base64.RawURLEncoding.EncodeToString(b)
	return raw, HashToken(raw), nil
}

// HashToken is how session and email tokens are stored.
func HashToken(raw string) []byte {
	h := sha256.Sum256([]byte(raw))
	return h[:]
}

// send renders and sends an email. Failures are logged, not returned: a
// booking must not fail because the email service is briefly down.
func (a *App) send(ctx context.Context, to, locale string, k email.Kind, d email.Data) {
	if to == "" {
		return // e.g. a WhatsApp client with no email address
	}
	m := email.Render(locale, k, d)
	m.To = to
	if err := a.mail.Send(ctx, m); err != nil {
		a.log.ErrorContext(ctx, "send email failed", "kind", k, "err", err)
	}
}
