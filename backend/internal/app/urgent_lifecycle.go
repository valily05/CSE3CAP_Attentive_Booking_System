package app

import (
	"context"
	"errors"
	"net/mail"
	"net/url"
	"strings"
	"time"

	"careconnect/internal/domain/auth"
	"careconnect/internal/domain/schedule"
	"careconnect/internal/email"
	"careconnect/internal/store"
)

type UrgentAssignment struct {
	PsychologistID string    `json:"psychologistId"`
	ServiceID      string    `json:"serviceId"`
	Channel        string    `json:"channel"`
	Start          time.Time `json:"start"`
}

func (a *App) UrgentDetail(ctx context.Context, act Actor, code string) (store.UrgentRequest, error) {
	if !act.IsAdmin() {
		return store.UrgentRequest{}, ErrForbidden
	}
	if !urgentCode.MatchString(code) {
		return store.UrgentRequest{}, ErrBadRequest
	}
	return a.store.UrgentByCode(ctx, code)
}

func (a *App) UrgentAction(ctx context.Context, act Actor, code, action, value string, verified bool) error {
	request, err := a.UrgentDetail(ctx, act, code)
	if err != nil {
		return err
	}
	switch action {
	case "cancel":
		if request.Workflow.AppointmentID != "" {
			return a.Cancel(ctx, act, request.Workflow.AppointmentID, "")
		}
	case "link":
		if !verified || !isUUID(value) {
			return ErrBadRequest
		}
	case "check-in":
		if request.SessionType != "onsite" {
			return ErrBadRequest
		}
	case "readiness":
		if request.Workflow.PsychologistID == "" && value != "awaiting" {
			return ErrBadRequest
		}
	default:
		return ErrBadRequest
	}
	return a.store.UrgentEvent(ctx, code, action, value, act.UserID)
}

func (a *App) UrgentQueue(ctx context.Context, act Actor, query, status, mode, location string, offset int) (map[string]any, error) {
	if !act.IsAdmin() {
		return nil, ErrForbidden
	}
	if len(query) > 254 || len(location) > 100 || offset < 0 || offset > 1000000 {
		return nil, ErrBadRequest
	}
	requests, counts, total, err := a.store.UrgentQueue(ctx, query, status, mode, location, offset)
	return map[string]any{"requests": requests, "counts": counts, "remainingCodes": 10000 - total, "offset": offset, "hasMore": len(requests) == 200}, err
}

func (a *App) UrgentActivity(ctx context.Context, act Actor, code string) ([]map[string]any, error) {
	if _, err := a.UrgentDetail(ctx, act, code); err != nil {
		return nil, err
	}
	return a.store.UrgentActivity(ctx, code)
}

func (a *App) UrgentRecent(ctx context.Context, request store.UrgentRequest) (bool, error) {
	return a.store.UrgentRecent(ctx, request)
}

func (a *App) ClientUrgentRequests(ctx context.Context, act Actor) ([]store.UrgentRequest, error) {
	if act.Role != "client" {
		return nil, ErrForbidden
	}
	return a.store.ClientUrgentRequests(ctx, act.ClientID)
}

func (a *App) CompleteUrgent(ctx context.Context, act Actor, code string) error {
	request, err := a.UrgentDetail(ctx, act, code)
	if err != nil {
		return err
	}
	if request.Workflow.AppointmentID == "" {
		return ErrBadRequest
	}
	return a.MarkAttendance(ctx, act, request.Workflow.AppointmentID, "attended")
}

func (a *App) UrgentGuest(ctx context.Context, act Actor, code string, verified bool) (string, error) {
	if _, err := a.UrgentDetail(ctx, act, code); err != nil {
		return "", err
	}
	if !verified {
		return "", ErrBadRequest
	}
	return a.store.UrgentGuest(ctx, code, act.UserID)
}

func (a *App) urgentPlace(ctx context.Context, request store.UrgentRequest, in UrgentAssignment) (BookInput, store.Service, error) {
	mode := "online"
	if request.SessionType == "onsite" {
		mode = "in_person"
	}
	place := BookInput{ClientID: request.Workflow.ClientID, PsychologistID: in.PsychologistID, ServiceID: in.ServiceID,
		Mode: mode, LocationID: request.LocationID, OnlineChannel: in.Channel, Start: in.Start}
	_, svc, err := a.checkPlace(ctx, place)
	if err != nil {
		return place, svc, err
	}
	if err = a.mustBeOpenSlot(ctx, place, svc, ""); err != nil {
		return place, svc, err
	}
	return place, svc, nil
}

func (a *App) AssignUrgent(ctx context.Context, act Actor, code string, in UrgentAssignment) error {
	request, err := a.UrgentDetail(ctx, act, code)
	if err != nil {
		return err
	}
	if _, _, err = a.urgentPlace(ctx, request, in); err != nil {
		return err
	}
	return a.store.AssignUrgent(ctx, code, in.PsychologistID, in.ServiceID, in.Channel, in.Start, act.UserID)
}

func (a *App) ConfirmUrgent(ctx context.Context, act Actor, code string) (store.Created, error) {
	request, err := a.UrgentDetail(ctx, act, code)
	if err != nil {
		return store.Created{}, err
	}
	if request.Workflow.AppointmentID != "" {
		return store.Created{ID: request.Workflow.AppointmentID, Code: code}, nil
	}
	if request.Workflow.ClientID == "" || request.Workflow.Start == nil || request.Status != "ASSIGNED" {
		return store.Created{}, ErrBadRequest
	}
	in := UrgentAssignment{PsychologistID: request.Workflow.PsychologistID, ServiceID: request.Workflow.ServiceID, Channel: request.Workflow.Channel, Start: *request.Workflow.Start}
	place, svc, err := a.urgentPlace(ctx, request, in)
	if err != nil {
		current, lookupErr := a.UrgentDetail(ctx, act, code)
		if lookupErr == nil && current.Workflow.AppointmentID != "" {
			return store.Created{ID: current.Workflow.AppointmentID, Code: code}, nil
		}
		return store.Created{}, err
	}
	settings, err := a.store.Settings(ctx)
	if err != nil {
		return store.Created{}, err
	}
	created, err := a.store.CreateBooking(ctx, store.NewBooking{ClientID: place.ClientID, PsychologistID: place.PsychologistID,
		ServiceID: place.ServiceID, Mode: schedule.Mode(place.Mode), OnlineChannel: place.OnlineChannel, LocationID: place.LocationID,
		Start: place.Start, End: place.Start.Add(time.Duration(svc.LengthMinutes) * time.Minute), Break: settings.Break, CreatedBy: act.UserID,
		UrgentID: request.ID, UrgentCode: code})
	if err != nil {
		return created, err
	}
	if created.Fresh {
		a.emailClient(ctx, created.ID, email.BookingConfirmed)
	}
	return created, nil
}

func (a *App) UrgentRecovery(ctx context.Context, code, address, locale string) error {
	if !urgentCode.MatchString(code) {
		return ErrBadRequest
	}
	parsed, err := mail.ParseAddress(address)
	if err != nil || parsed.Address != address {
		return ErrBadRequest
	}
	token, hash, err := newToken()
	if err != nil {
		return err
	}
	err = a.store.CreateUrgentRecovery(ctx, code, address, hash)
	if errors.Is(err, store.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	a.send(ctx, address, locale, email.UrgentRecovery, email.Data{Code: code, Link: a.base + "/urgent-recovery#" + token})
	return nil
}

func (a *App) RedeemUrgentRecovery(ctx context.Context, token string) (store.UrgentRequest, string, error) {
	if !urgentToken.MatchString(token) {
		return store.UrgentRequest{}, "", store.ErrNotFound
	}
	owner, hash, err := newToken()
	if err != nil {
		return store.UrgentRequest{}, "", err
	}
	if err = a.store.RedeemUrgentRecovery(ctx, HashToken(token), hash); err != nil {
		return store.UrgentRequest{}, "", err
	}
	request, err := a.store.UrgentReceipt(ctx, hash)
	return request, owner, err
}

func (a *App) UrgentArrival(ctx context.Context, token, choice string) error {
	if !urgentToken.MatchString(token) {
		return ErrBadRequest
	}
	return a.store.UrgentArrival(ctx, HashToken(token), choice)
}

func (a *App) InviteUrgentClient(ctx context.Context, act Actor, code, address, purpose, locale string, consent bool) error {
	request, err := a.UrgentDetail(ctx, act, code)
	if err != nil {
		return err
	}
	if !consent || request.Workflow.ClientID == "" || (purpose != "activate" && purpose != "change_email") {
		return ErrBadRequest
	}
	if purpose == "activate" {
		contact, err := a.store.ClientContact(ctx, request.Workflow.ClientID)
		if err != nil {
			return err
		}
		address = contact.Email
	}
	parsed, err := mail.ParseAddress(address)
	if err != nil || parsed.Address != address {
		return ErrBadRequest
	}
	raw, hash, err := newToken()
	if err != nil {
		return err
	}
	if err = a.store.CreateClientAccountLink(ctx, request.Workflow.ClientID, address, purpose, act.UserID, hash); err != nil {
		return err
	}
	a.send(ctx, address, locale, email.ClientAccess, email.Data{Link: a.base + "/client-activation#" + raw})
	return nil
}

func (a *App) ActivateUrgentClient(ctx context.Context, token, password string) error {
	if !urgentToken.MatchString(token) {
		return ErrBadRequest
	}
	var hash string
	var err error
	if password != "" {
		if len(password) < 8 || len(password) > 72 {
			return auth.ErrWeakPassword
		}
		hash, err = auth.HashPassword(password)
		if err != nil {
			return err
		}
	}
	return a.store.RedeemClientAccountLink(ctx, HashToken(token), hash)
}

func (a *App) ClientAccountPurpose(ctx context.Context, token string) (string, error) {
	if !urgentToken.MatchString(token) {
		return "", ErrBadRequest
	}
	return a.store.ClientAccountPurpose(ctx, HashToken(token))
}

func (a *App) UrgentLocation(ctx context.Context, act Actor, id, address, maps string, verified bool) error {
	if !act.IsAdmin() {
		return ErrForbidden
	}
	if !verified || len(address) > 1000 || len(maps) > 2000 {
		return ErrBadRequest
	}
	if maps != "" {
		parsed, err := url.Parse(maps)
		if err != nil || parsed.Scheme != "https" || parsed.User != nil || !(parsed.Host == "www.google.com" || parsed.Host == "maps.google.com" || parsed.Host == "maps.app.goo.gl") {
			return ErrBadRequest
		}
	}
	return a.store.SetUrgentLocation(ctx, id, strings.TrimSpace(address), maps, act.UserID)
}
