package app

import (
	"careconnect/internal/domain/auth"
	"careconnect/internal/email"
	"careconnect/internal/store"
	"context"
	"errors"
	"strings"
)

func (a *App) MyClientProfile(ctx context.Context, actor Actor) (store.ClientProfile, error) {
	if actor.Role != "client" || actor.ClientID == "" {
		return store.ClientProfile{}, ErrForbidden
	}
	return a.store.ClientProfile(ctx, actor.UserID, a.clock.Now())
}
func (a *App) UpdateClientProfile(ctx context.Context, actor Actor, p store.ClientProfile) error {
	if actor.Role != "client" || actor.ClientID == "" {
		return ErrForbidden
	}
	p.Name = strings.TrimSpace(p.Name)
	p.Phone = auth.NormalizePhone(p.Phone)
	p.City = strings.TrimSpace(p.City)
	p.OtherCountry = strings.TrimSpace(p.OtherCountry)
	if p.Name == "" || len(p.Name) > 160 {
		return auth.ErrNameRequired
	}
	if !auth.ValidPhone(p.Phone) {
		return auth.ErrInvalidPhone
	}
	if p.Country != "OTHER" {
		p.OtherCountry = ""
	}
	if err := auth.ValidateResidence(auth.SignUp{Country: p.Country, OtherCountry: p.OtherCountry, City: p.City, TimeZone: p.TimeZone}); err != nil {
		return err
	}
	return a.store.UpdateClientProfile(ctx, actor.UserID, p)
}
func (a *App) profilePassword(ctx context.Context, actor Actor, password string) (store.User, error) {
	if actor.Role != "client" || actor.ClientID == "" {
		return store.User{}, ErrForbidden
	}
	u, err := a.store.UserByID(ctx, actor.UserID)
	if err != nil {
		return u, err
	}
	if u.Attempts.Locked(a.clock.Now()) {
		return u, ErrLocked
	}
	if !auth.CheckPassword(u.PasswordHash, password) {
		if err := a.store.SaveAttempts(ctx, u.ID, u.Attempts.Failed(a.clock.Now())); err != nil {
			return u, err
		}
		return u, ErrBadCredentials
	}
	return u, a.store.SaveAttempts(ctx, u.ID, u.Attempts.Succeeded())
}
func (a *App) ChangeProfilePassword(ctx context.Context, actor Actor, current, password string) error {
	if _, err := a.profilePassword(ctx, actor, current); err != nil {
		return err
	}
	if !auth.ValidPassword(password) {
		return auth.ErrWeakPassword
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}
	return a.store.SetPassword(ctx, actor.UserID, hash)
}
func (a *App) RequestProfileEmailChange(ctx context.Context, actor Actor, current, address, locale string) error {
	u, err := a.profilePassword(ctx, actor, current)
	if err != nil {
		return err
	}
	address = strings.ToLower(strings.TrimSpace(address))
	if !auth.ValidEmail(address) {
		return auth.ErrInvalidEmail
	}
	if strings.EqualFold(u.Email, address) {
		return auth.ErrInvalidEmail
	}
	if _, err := a.store.UserByEmail(ctx, address); err == nil {
		return store.ErrEmailTaken
	} else if !errors.Is(err, store.ErrNotFound) {
		return err
	}
	raw, hash, err := newToken()
	if err != nil {
		return err
	}
	if err = a.store.SaveProfileEmailChange(ctx, u.ID, address, hash, a.clock.Now().Add(verifyLifetime)); err != nil {
		return err
	}
	m := email.Render(locale, email.VerifyEmail, email.Data{Link: a.base + "/verify?token=" + raw})
	m.To = address
	if err = a.mail.Send(ctx, m); err != nil {
		return ErrEmailDelivery
	}
	return nil
}
