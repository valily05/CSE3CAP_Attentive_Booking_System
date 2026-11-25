package app

import (
	"context"
	"errors"
	"fmt"
	netmail "net/mail"
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

var ErrAccountUnverified = errors.New("account exists but email is not verified")

var ErrEmailDelivery = errors.New("verification email could not be sent")

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
	if errors.Is(err, store.ErrEmailTaken) {
		existing, lookupErr := a.store.UserByEmail(ctx, in.Email)
		if lookupErr != nil {
			return lookupErr
		}
		if existing.Role == "client" && !existing.EmailVerified {
			return ErrAccountUnverified
		}
	}
	if err != nil {
		return err
	}
	if _, err := a.store.CreateClient(ctx, store.NewClient{
		UserID: userID, Name: strings.TrimSpace(in.Name), Email: in.Email, Phone: auth.NormalizePhone(in.Phone),
		AgreedToMessages: in.CheckInConsent, Locale: in.Locale,
		Country: in.Country, OtherCountry: strings.TrimSpace(in.OtherCountry), City: strings.TrimSpace(in.City), TimeZone: in.TimeZone,
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
	m := email.Render(locale, k, email.Data{FirstName: name, Link: a.base + page + "?token=" + raw})
	m.To = to
	if err := a.mail.Send(ctx, m); err != nil {
		a.log.ErrorContext(ctx, "account email delivery failed", "kind", k, "err", err)
		if purpose == "verify_email" {
			return ErrEmailDelivery
		}
	}
	return nil
}

// ResendVerification does not change an existing password or create accounts.
func (a *App) ResendVerification(ctx context.Context, address, locale string) error {
	address = strings.TrimSpace(address)
	parsed, err := netmail.ParseAddress(address)
	if err != nil || parsed.Address != address {
		return auth.ErrInvalidEmail
	}
	u, err := a.store.UserByEmail(ctx, address)
	if errors.Is(err, store.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if u.EmailVerified || u.Role != "client" {
		return nil
	}
	name := ""
	if u.ClientID != "" {
		if c, err := a.store.ClientContact(ctx, u.ClientID); err == nil {
			name = firstName(c.Name)
		}
	}
	return a.sendEmailLink(ctx, u.ID, u.Email, name, locale, "verify_email", verifyLifetime, email.VerifyEmail, "/verify")
}

// VerifyEmail consumes a confirmation link.
func (a *App) VerifyEmail(ctx context.Context, token string) error {
	_, err := a.VerifyEmailWithNotice(ctx, token)
	return err
}

// VerifyEmailWithNotice exposes the address only after a valid single-use email token.
func (a *App) VerifyEmailWithNotice(ctx context.Context, token string) (string, error) {
	userID, err := a.store.UseEmailToken(ctx, HashToken(token), "verify_email", a.clock.Now())
	if err != nil {
		return "", err
	}
	user, err := a.store.UserByID(ctx, userID)
	if err != nil {
		return "", err
	}
	if err = a.store.MarkEmailVerified(ctx, userID); err != nil {
		return "", err
	}
	return user.Email, nil
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
	if err := a.store.CreateSessionWithWelcome(ctx, hash, u.ID, now.Add(SessionLifetime), now, u.Role == "client"); err != nil {
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
	Role         string `json:"role"`
	Name         string `json:"name"`
	Email        string `json:"email"`
	Locale       string `json:"locale,omitempty"`
	Country      string `json:"country,omitempty"`
	OtherCountry string `json:"otherCountry,omitempty"`
	City         string `json:"city,omitempty"`
	TimeZone     string `json:"timeZone,omitempty"`
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
		p.Country, p.OtherCountry, p.City, p.TimeZone = c.Country, c.OtherCountry, c.City, c.TimeZone
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
	_, err := a.ResetPasswordWithNotice(ctx, token, password)
	return err
}
func (a *App) ResetPasswordWithNotice(ctx context.Context, token, password string) (string, error) {
	if !auth.ValidPassword(password) {
		return "", auth.ErrWeakPassword
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return "", err
	}
	userID, err := a.store.UseEmailToken(ctx, HashToken(token), "reset_password", a.clock.Now())
	if err != nil {
		return "", err
	}
	user, err := a.store.UserByID(ctx, userID)
	if err != nil {
		return "", err
	}
	if err = a.store.SetPassword(ctx, userID, hash); err != nil {
		return "", err
	}
	return user.Email, nil
}

func firstName(full string) string {
	f, _, _ := strings.Cut(strings.TrimSpace(full), " ")
	return f
}
