package app

import (
	"context"
	"net/mail"
	"strings"
	"time"

	"careconnect/internal/domain/auth"
	"careconnect/internal/domain/reports"
	"careconnect/internal/store"
)

func (a *App) requireAdmin(act Actor) error {
	if !act.IsAdmin() {
		return ErrForbidden
	}
	return nil
}

// NewWalkInClient is a client an admin adds, e.g. someone booking on WhatsApp.
type NewWalkInClient struct {
	Name, Phone, Email string
}

// AdminCreateClient adds a client without a login. They never ticked the
// check-in box, so they receive no follow-ups.
func (a *App) AdminCreateClient(ctx context.Context, act Actor, c NewWalkInClient) (string, error) {
	if err := a.requireAdmin(act); err != nil {
		return "", err
	}
	c.Name, c.Email = strings.TrimSpace(c.Name), strings.TrimSpace(c.Email)
	switch {
	case c.Name == "":
		return "", auth.ErrNameRequired
	case c.Email != "":
		if _, err := mail.ParseAddress(c.Email); err != nil {
			return "", auth.ErrInvalidEmail
		}
	}
	if !auth.ValidPhone(c.Phone) {
		return "", auth.ErrInvalidPhone
	}
	return a.store.CreateClient(ctx, store.NewClient{Name: c.Name, Email: c.Email, Phone: auth.NormalizePhone(c.Phone)})
}

// SearchClients finds clients for the admin booking form.
func (a *App) SearchClients(ctx context.Context, act Actor, q string) ([]store.ClientSummary, error) {
	if err := a.requireAdmin(act); err != nil {
		return nil, err
	}
	if len(strings.TrimSpace(q)) < 2 {
		return []store.ClientSummary{}, nil
	}
	return a.store.SearchClients(ctx, strings.TrimSpace(q))
}

// Calendar lists every booking matching the admin's filters (G09-9).
func (a *App) Calendar(ctx context.Context, act Actor, f store.BookingFilter) ([]store.BookingView, error) {
	if err := a.requireAdmin(act); err != nil {
		return nil, err
	}
	f.AllClients = true
	return a.store.ListBookings(ctx, f)
}

// History is the admin change log.
func (a *App) History(ctx context.Context, act Actor) ([]store.HistoryEntry, error) {
	if err := a.requireAdmin(act); err != nil {
		return nil, err
	}
	return a.store.History(ctx, 200)
}

// Settings returns the admin settings.
func (a *App) Settings(ctx context.Context, act Actor) (store.Settings, error) {
	if err := a.requireAdmin(act); err != nil {
		return store.Settings{}, err
	}
	return a.store.Settings(ctx)
}

// UpdateSettings saves the admin settings.
func (a *App) UpdateSettings(ctx context.Context, act Actor, st store.Settings) error {
	if err := a.requireAdmin(act); err != nil {
		return err
	}
	return a.store.UpdateSettings(ctx, st, act.UserID)
}

// Report is G09-10: numbers only, never client names.
type Report struct {
	From           time.Time                 `json:"from"`
	To             time.Time                 `json:"to"`
	Totals         reports.Totals            `json:"totals"`
	ByPsychologist map[string]reports.Totals `json:"byPsychologist"` // keyed by psychologist name
	ByPlace        map[string]reports.Totals `json:"byPlace"`        // location ID or "online"
	ByService      map[string]reports.Totals `json:"byService"`
}

// Report computes the numbers for a week or month starting at start.
func (a *App) Report(ctx context.Context, act Actor, period string, start time.Time) (Report, error) {
	if err := a.requireAdmin(act); err != nil {
		return Report{}, err
	}
	var end time.Time
	switch period {
	case "week":
		end = start.AddDate(0, 0, 7)
	case "month":
		end = start.AddDate(0, 1, 0)
	default:
		return Report{}, ErrBadRequest
	}
	rows, err := a.store.ReportRows(ctx, start, end)
	if err != nil {
		return Report{}, err
	}
	names, err := a.store.PsychologistNames(ctx)
	if err != nil {
		return Report{}, err
	}
	byPsych := map[string]reports.Totals{}
	for id, t := range reports.Breakdown(rows, reports.ByPsychologist) {
		byPsych[names[id]] = t
	}
	return Report{
		From: start, To: end, Totals: reports.Summarize(rows), ByPsychologist: byPsych,
		ByPlace: reports.Breakdown(rows, reports.ByPlace), ByService: reports.Breakdown(rows, reports.ByService),
	}, nil
}
