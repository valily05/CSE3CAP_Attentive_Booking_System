package app

import (
	"context"
	"net/mail"
	"regexp"
	"strings"
	"unicode/utf8"

	"careconnect/internal/email"
	"careconnect/internal/store"
)

type UrgentInput struct {
	CustomerName   string `json:"customerName"`
	Email          string `json:"email"`
	WhatsAppNumber string `json:"whatsappNumber"`
	SessionType    string `json:"sessionType"`
	LocationID     string `json:"locationId"`
	Acknowledged   bool   `json:"acknowledged"`
	SubmissionKey  string `json:"submissionKey"`
	Locale         string `json:"locale"`
}

var urgentPhone = regexp.MustCompile(`^\+[1-9][0-9]{7,14}$`)
var urgentCode = regexp.MustCompile(`^ATT[0-9]{4}$`)
var urgentToken = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

func (a *App) AllowUrgent(ctx context.Context, key string, limit int) (bool, error) {
	return a.store.LimitUrgent(ctx, HashToken(key), a.clock.Now(), limit)
}

func (a *App) CreateUrgent(ctx context.Context, in UrgentInput) (store.UrgentRequest, string, error) {
	in.CustomerName = strings.TrimSpace(in.CustomerName)
	in.Email = strings.TrimSpace(in.Email)
	address, err := mail.ParseAddress(in.Email)
	if !in.Acknowledged || in.CustomerName == "" || utf8.RuneCountInString(in.CustomerName) > 160 ||
		len(in.Email) > 254 || err != nil || address.Address != in.Email ||
		(in.WhatsAppNumber != "" && !urgentPhone.MatchString(in.WhatsAppNumber)) ||
		(in.SessionType != "online" && in.SessionType != "onsite") ||
		(in.SessionType == "online" && in.LocationID != "") ||
		(in.SessionType == "onsite" && (in.LocationID == "" || len(in.LocationID) > 100)) {
		return store.UrgentRequest{}, "", ErrBadRequest
	}
	token, hash, err := newToken()
	if err != nil {
		return store.UrgentRequest{}, "", err
	}
	if in.SubmissionKey != "" {
		if !urgentToken.MatchString(in.SubmissionKey) {
			return store.UrgentRequest{}, "", ErrBadRequest
		}
		token = in.SubmissionKey
		hash = HashToken(token)
	}
	_, previousErr := a.store.UrgentReceipt(ctx, hash)
	result, err := a.store.CreateUrgent(ctx, store.UrgentRequest{
		CustomerName: in.CustomerName, Email: in.Email, WhatsAppNumber: in.WhatsAppNumber,
		SessionType: in.SessionType, LocationID: in.LocationID}, hash, a.clock.Now())
	if err == nil && previousErr != nil {
		a.send(ctx, in.Email, in.Locale, email.UrgentReceived, email.Data{Code: result.BookingCode, Link: a.base + "/"})
	}
	return result, token, err
}

func (a *App) UrgentReceipt(ctx context.Context, token string) (store.UrgentRequest, error) {
	if !urgentToken.MatchString(token) {
		return store.UrgentRequest{}, store.ErrNotFound
	}
	return a.store.UrgentReceipt(ctx, HashToken(token))
}

func (a *App) UrgentRequests(ctx context.Context, act Actor, code, token string) ([]store.UrgentRequest, error) {
	if !act.IsAdmin() {
		return nil, ErrForbidden
	}
	code = strings.ToUpper(strings.TrimSpace(code))
	if code != "" && !urgentCode.MatchString(code) {
		return nil, ErrBadRequest
	}
	var hash []byte
	if token != "" {
		if !urgentToken.MatchString(token) {
			return nil, ErrBadRequest
		}
		hash = HashToken(token)
	}
	return a.store.UrgentRequests(ctx, code, hash)
}

func (a *App) UpdateUrgent(ctx context.Context, act Actor, id, status, previous string) error {
	if !act.IsAdmin() {
		return ErrForbidden
	}
	valid := map[string]bool{"PENDING": true, "CONTACTED": true}
	if !valid[status] || !valid[previous] {
		return ErrBadRequest
	}
	return a.store.UpdateUrgent(ctx, id, status, previous, act.UserID, a.clock.Now())
}
