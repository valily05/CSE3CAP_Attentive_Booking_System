package app

import (
	"careconnect/internal/domain/auth"
	"context"
	"strings"
)

type Residence struct {
	Email        string `json:"email"`
	Country      string `json:"country"`
	OtherCountry string `json:"otherCountry"`
	City         string `json:"city"`
	TimeZone     string `json:"timeZone"`
}

func (a *App) MyResidence(ctx context.Context, actor Actor) (Residence, error) {
	if actor.Role != "client" || actor.ClientID == "" {
		return Residence{}, ErrForbidden
	}
	c, err := a.store.ClientContact(ctx, actor.ClientID)
	return Residence{Email: c.Email, Country: c.Country, OtherCountry: c.OtherCountry, City: c.City, TimeZone: c.TimeZone}, err
}
func (a *App) UpdateResidence(ctx context.Context, actor Actor, r Residence) error {
	if actor.Role != "client" || actor.ClientID == "" {
		return ErrForbidden
	}
	r.City = strings.TrimSpace(r.City)
	r.OtherCountry = strings.TrimSpace(r.OtherCountry)
	if r.Country != "OTHER" {
		r.OtherCountry = ""
	}
	if err := auth.ValidateResidence(auth.SignUp{Country: r.Country, OtherCountry: r.OtherCountry, City: r.City, TimeZone: r.TimeZone}); err != nil {
		return err
	}
	return a.store.UpdateClientResidence(ctx, actor.ClientID, r.Country, r.OtherCountry, r.City, r.TimeZone)
}
