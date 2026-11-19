package app

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"careconnect/internal/domain/auth"
	"careconnect/internal/email"
	"careconnect/internal/store"
)

const (
	SessionLifetime = 7 * 24 * time.Hour
	verifyLifetime  = 24 * time.Hour
	resetLifetime   = time.Hour
)

// SignUpInput is the client sign-up form.
type SignUpInput struct {
	auth.SignUp
	Locale string
}

// SignUp creates a client account and emails a confirmation link.
func (a *App) SignUp(ctx context.Context, in SignUpInput) error {
	in.Email = strings.TrimSpace(in.Email)
	if err := auth.ValidateSignUp(in.SignUp); err != nil {
		return err
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		return err
	}
	userID, err := a.store.CreateUser(ctx, store.NewUser{Email: in.Email, PasswordHash: hash, Role: "client"})
	if err != nil {
		return err
	}
	if _, err := a.store.CreateClient(ctx, store.NewClient{
		UserID: userID, Name: strings.TrimSpace(in.Name), Email: in.Email, Phone: auth.NormalizePhone(in.Phone),
		AgreedToMessages: in.CheckInConsent, Locale: in.Locale,
	}); err != nil {
		return err
	}
	return a.sendEmailLink(ctx, userID, in.Email, firstName(in.Name), in.Locale, "verify_email", verifyLifetime, email.VerifyEmail, "/verify")
}

func (a *App) sendEmailLink(ctx context.Context, userID, to, name, locale, purpose string, life time.Duration, k email.Kind, page string) error {
	raw, hash, err := newToken()
	if err != nil {
		return err
	}
	if err := a.store.CreateEmailToken(ctx, hash, userID, purpose, a.clock.Now().Add(life)); err != nil {
		return err
	}
	a.send(ctx, to, locale, k, email.Data{FirstName: name, Link: a.base + page + "?token=" + raw})
	return nil
}

// VerifyEmail consumes a confirmation link.
func (a *App) VerifyEmail(ctx context.Context, token string) error {
	userID, err := a.store.UseEmailToken(ctx, HashToken(token), "verify_email", a.clock.Now())
	if err != nil {
		return err
	}
	return a.store.MarkEmailVerified(ctx, userID)
}

// Login checks credentials and returns a new session token.
func (a *App) Login(ctx context.Context, emailAddr, password string) (string, error) {
	now := a.clock.Now()
	u, err := a.store.UserByEmail(ctx, strings.TrimSpace(emailAddr))
	if errors.Is(err, store.ErrNotFound) {
		auth.CheckPassword(dummyHash, password) // same work either way: no account probing by timing
		return "", ErrBadCredentials
	}
	if err != nil {
		return "", err
	}
	if u.Attempts.Locked(now) {
		return "", ErrLocked
	}
	if !auth.CheckPassword(u.PasswordHash, password) {
		att := u.Attempts.Failed(now)
		if err := a.store.SaveAttempts(ctx, u.ID, att); err != nil {
			return "", err
		}
		if att.Locked(now) {
			return "", ErrLocked
		}
		return "", ErrBadCredentials
	}
	if !u.EmailVerified {
		return "", ErrEmailNotVerified
	}
	if err := a.store.SaveAttempts(ctx, u.ID, u.Attempts.Succeeded()); err != nil {
		return "", err
	}
	raw, hash, err := newToken()
	if err != nil {
		return "", err
	}
	if err := a.store.CreateSession(ctx, hash, u.ID, now.Add(SessionLifetime)); err != nil {
		return "", fmt.Errorf("create session: %w", err)
	}
	return raw, nil
}

var dummyHash = func() string {
	h, _ := auth.HashPassword("timing-equaliser")
	return h
}()

// Authenticate turns a session token into an Actor.
func (a *App) Authenticate(ctx context.Context, token string) (Actor, error) {
	if token == "" {
		return Actor{}, ErrUnauthenticated
	}
	u, err := a.store.SessionUser(ctx, HashToken(token), a.clock.Now())
	if errors.Is(err, store.ErrNotFound) {
		return Actor{}, ErrUnauthenticated
	}
	if err != nil {
		return Actor{}, err
	}
	return Actor{UserID: u.ID, Role: u.Role, ClientID: u.ClientID, PsychologistID: u.PsychologistID}, nil
}

// Logout ends a session.
func (a *App) Logout(ctx context.Context, token string) error {
	return a.store.DeleteSession(ctx, HashToken(token))
}

// Profile is the signed-in user's own summary.
type Profile struct {
	Role   string `json:"role"`
	Name   string `json:"name"`
	Email  string `json:"email"`
	Locale string `json:"locale,omitempty"`
}

// Me describes the signed-in user.
func (a *App) Me(ctx context.Context, act Actor) (Profile, error) {
	u, err := a.store.UserByID(ctx, act.UserID)
	if err != nil {
		return Profile{}, err
	}
	p := Profile{Role: u.Role, Email: u.Email, Name: u.Email}
	switch {
	case u.ClientID != "":
		c, err := a.store.ClientContact(ctx, u.ClientID)
		if err != nil {
			return Profile{}, err
		}
		p.Name, p.Locale = c.Name, c.Locale
	case u.PsychologistID != "":
		ps, err := a.store.GetPsychologist(ctx, u.PsychologistID)
		if err == nil {
			p.Name = ps.Name
		}
	}
	return p, nil
}

// ForgotPassword emails a reset link. It reports success either way so the
// form cannot be used to find out who has an account.
func (a *App) ForgotPassword(ctx context.Context, emailAddr, locale string) error {
	u, err := a.store.UserByEmail(ctx, strings.TrimSpace(emailAddr))
	if errors.Is(err, store.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	name := ""
	if u.ClientID != "" {
		if c, err := a.store.ClientContact(ctx, u.ClientID); err == nil {
			name, locale = firstName(c.Name), c.Locale
		}
	}
	return a.sendEmailLink(ctx, u.ID, u.Email, name, locale, "reset_password", resetLifetime, email.ResetPassword, "/reset-password")
}

// ResetPassword sets a new password from a reset link.
func (a *App) ResetPassword(ctx context.Context, token, password string) error {
	if len(password) < 8 {
		return auth.ErrWeakPassword
	}
	userID, err := a.store.UseEmailToken(ctx, HashToken(token), "reset_password", a.clock.Now())
	if err != nil {
		return err
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}
	return a.store.SetPassword(ctx, userID, hash)
}

func firstName(full string) string {
	f, _, _ := strings.Cut(strings.TrimSpace(full), " ")
	return f
}
