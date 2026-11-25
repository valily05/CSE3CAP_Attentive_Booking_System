// Package httpapi is the JSON API. Errors are returned as stable codes
// ({"error":"slot_taken"}) that the website translates; the API never
// sends user-facing sentences.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"mime"
	"net/http"

	"careconnect/internal/app"
	"careconnect/internal/domain/auth"
	"careconnect/internal/domain/booking"
	"careconnect/internal/domain/schedule"
	"careconnect/internal/store"
)

const sessionCookie = "cc_session"

type server struct{ app *app.App }

// New returns the API handler.
func New(a *app.App) http.Handler {
	s := &server{app: a}
	mux := http.NewServeMux()
	s.routes(mux)
	return requireJSON(mux)
}

// requireJSON blocks cross-site form posts: browsers cannot send a JSON
// body to another site without a CORS preflight, which we never allow.
func requireJSON(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.ContentLength != 0 {
			mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if mt != "application/json" {
				writeError(w, r, errUnsupportedMedia)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

var errUnsupportedMedia = errors.New("unsupported media type")

type ctxKey struct{}

func actorFrom(ctx context.Context) app.Actor {
	a, _ := ctx.Value(ctxKey{}).(app.Actor)
	return a
}

// authed wraps a handler that needs a signed-in user with one of roles.
func (s *server) authed(h http.HandlerFunc, roles ...string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, _ := r.Cookie(sessionCookie)
		token := ""
		if c != nil {
			token = c.Value
		}
		act, err := s.app.Authenticate(r.Context(), token)
		if err != nil {
			writeError(w, r, err)
			return
		}
		allowed := len(roles) == 0
		for _, role := range roles {
			allowed = allowed || act.Role == role
		}
		if !allowed {
			writeError(w, r, app.ErrForbidden)
			return
		}
		h(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, act)))
	}
}

func decode(r *http.Request, v any) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return app.ErrBadRequest
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

type apiError struct {
	status int
	code   string
}

var errorTable = []struct {
	err error
	apiError
}{
	{app.ErrBadRequest, apiError{http.StatusBadRequest, "bad_request"}},
	{store.ErrUrgentCodeConflict, apiError{http.StatusConflict, "urgent_code_conflict"}},
	{errUnsupportedMedia, apiError{http.StatusUnsupportedMediaType, "json_required"}},
	{app.ErrUnauthenticated, apiError{http.StatusUnauthorized, "unauthenticated"}},
	{app.ErrBadCredentials, apiError{http.StatusUnauthorized, "bad_credentials"}},
	{app.ErrEmailNotVerified, apiError{http.StatusForbidden, "email_not_verified"}},
	{app.ErrForbidden, apiError{http.StatusForbidden, "forbidden"}},
	{app.ErrLocked, apiError{http.StatusLocked, "account_locked"}},
	{app.ErrChangeWindowClosed, apiError{http.StatusForbidden, "change_window_closed"}},
	{app.ErrSlotUnavailable, apiError{http.StatusConflict, "slot_unavailable"}},
	{app.ErrChannelRequired, apiError{http.StatusUnprocessableEntity, "channel_required"}},
	{app.ErrServiceNotOffered, apiError{http.StatusUnprocessableEntity, "service_not_offered"}},
	{auth.ErrPrivacyRequired, apiError{http.StatusUnprocessableEntity, "privacy_required"}},
	{auth.ErrNameRequired, apiError{http.StatusUnprocessableEntity, "name_required"}},
	{auth.ErrInvalidEmail, apiError{http.StatusUnprocessableEntity, "invalid_email"}},
	{auth.ErrInvalidPhone, apiError{http.StatusUnprocessableEntity, "invalid_phone"}},
	{auth.ErrInvalidResidence, apiError{http.StatusUnprocessableEntity, "invalid_residence"}},
	{auth.ErrWeakPassword, apiError{http.StatusUnprocessableEntity, "weak_password"}},
	{booking.ErrInPast, apiError{http.StatusUnprocessableEntity, "in_past"}},
	{booking.ErrTooSoon, apiError{http.StatusUnprocessableEntity, "too_soon"}},
	{booking.ErrInvalidTransition, apiError{http.StatusConflict, "invalid_transition"}},
	{booking.ErrSessionNotStarted, apiError{http.StatusConflict, "session_not_started"}},
	{schedule.ErrInvalidRange, apiError{http.StatusUnprocessableEntity, "invalid_range"}},
	{schedule.ErrOverlappingHours, apiError{http.StatusUnprocessableEntity, "overlapping_hours"}},
	{schedule.ErrLocationRequired, apiError{http.StatusUnprocessableEntity, "location_required"}},
	{schedule.ErrOnlineHasLocation, apiError{http.StatusUnprocessableEntity, "online_has_location"}},
	{store.ErrEmailTaken, apiError{http.StatusConflict, "email_taken"}},
	{app.ErrAccountUnverified, apiError{http.StatusConflict, "account_unverified"}},
	{app.ErrEmailDelivery, apiError{http.StatusServiceUnavailable, "email_delivery_failed"}},
	{store.ErrNotFound, apiError{http.StatusNotFound, "not_found"}},
	{store.ErrSlotTaken, apiError{http.StatusConflict, "slot_taken"}},
	{store.ErrNotChangeable, apiError{http.StatusConflict, "not_changeable"}},
	{store.ErrInvalidSetting, apiError{http.StatusUnprocessableEntity, "invalid_setting"}},
}

func writeError(w http.ResponseWriter, r *http.Request, err error) {
	for _, e := range errorTable {
		if errors.Is(err, e.err) {
			writeJSON(w, e.status, map[string]string{"error": e.code})
			return
		}
	}
	slog.ErrorContext(r.Context(), "internal error", "path", r.URL.Path, "err", err)
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal"})
}
