package app

import (
	"context"
	"regexp"
	"slices"
	"time"

	"careconnect/internal/store"
)

// Catalog lists active locations and services.
func (a *App) Catalog(ctx context.Context) (store.Catalog, error) { return a.store.Catalog(ctx) }

// PsychologistResult is a search card with its next open time and how many
// times are open on each of the next seven days.
type PsychologistResult struct {
	store.PsychologistCard
	NextOpen *time.Time `json:"nextOpen"`
	Week     []DayCount `json:"week"`
}

// DayCount is the number of open times on one WIB date.
type DayCount struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

// SearchPsychologists runs the public "Our Psychologists" search.
func (a *App) SearchPsychologists(ctx context.Context, f store.PsychologistFilter) ([]PsychologistResult, error) {
	if !oneOf(f.AgeGroup, "", "adult", "child_teen", "family_couple") || !oneOf(f.Mode, "", "online", "in_person") {
		return nil, ErrBadRequest
	}
	cards, err := a.store.SearchPsychologists(ctx, f)
	if err != nil {
		return nil, err
	}
	cat, err := a.store.Catalog(ctx)
	if err != nil {
		return nil, err
	}
	services := map[string]store.Service{}
	for _, s := range cat.Services {
		services[s.ID] = s
	}
	out := make([]PsychologistResult, len(cards))
	for i, c := range cards {
		out[i].PsychologistCard = c
		if out[i].NextOpen, out[i].Week, err = a.availability(ctx, c, services); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// Psychologist returns one public profile.
func (a *App) Psychologist(ctx context.Context, id string) (store.PsychologistCard, error) {
	if !isUUID(id) {
		return store.PsychologistCard{}, store.ErrNotFound
	}
	return a.store.GetPsychologist(ctx, id)
}

// Profile returns one public profile with its next open time.
func (a *App) Profile(ctx context.Context, id string) (PsychologistResult, error) {
	card, err := a.Psychologist(ctx, id)
	if err != nil {
		return PsychologistResult{}, err
	}
	cat, err := a.store.Catalog(ctx)
	if err != nil {
		return PsychologistResult{}, err
	}
	services := map[string]store.Service{}
	for _, s := range cat.Services {
		services[s.ID] = s
	}
	next, week, err := a.availability(ctx, card, services)
	return PsychologistResult{PsychologistCard: card, NextOpen: next, Week: week}, err
}

func oneOf(v string, allowed ...string) bool { return slices.Contains(allowed, v) }

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func isUUID(s string) bool { return uuidPattern.MatchString(s) }
