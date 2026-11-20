package httpapi

import (
	"net/http"

	"careconnect/internal/app"
)

func (s *server) urgentLifecycleRoutes(mux *http.ServeMux) {
	// Guest confirmations are reopened from browser notifications.

	mux.HandleFunc("POST /api/urgent-requests/arrival", s.urgentArrival)
	mux.HandleFunc("POST /api/client-access/redeem", s.clientActivate)
	mux.HandleFunc("POST /api/client-access/details", s.clientAccessDetails)
	mux.HandleFunc("GET /api/admin/urgent-requests/{code}", s.authed(s.urgentDetail, "admin"))
	mux.HandleFunc("GET /api/admin/urgent-requests/scan/{code}", s.authed(s.urgentDetail, "admin"))
	mux.HandleFunc("POST /api/admin/urgent-requests/{code}/{action}", s.authed(s.urgentAction, "admin"))
	mux.HandleFunc("PUT /api/admin/urgent-locations/{id}", s.authed(s.urgentLocation, "admin"))
	mux.HandleFunc("GET /api/me/urgent-requests", s.authed(s.myUrgent, "client"))
}

func (s *server) urgentArrival(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token  string `json:"token"`
		Choice string `json:"choice"`
	}
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if s.urgentLimited(w, r, "urgent-arrival:"+in.Token, 60) {
		return
	}
	if err := s.app.UrgentArrival(r.Context(), in.Token, in.Choice); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(204)
}

func (s *server) urgentDetail(w http.ResponseWriter, r *http.Request) {
	request, err := s.app.UrgentDetail(r.Context(), actorFrom(r.Context()), r.PathValue("code"))
	if err != nil {
		writeError(w, r, err)
		return
	}
	activity, err := s.app.UrgentActivity(r.Context(), actorFrom(r.Context()), request.BookingCode)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"request": request, "activity": activity})
}

func (s *server) urgentAction(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Value    string `json:"value"`
		Verified bool   `json:"verified"`
		app.UrgentAssignment
		Email   string `json:"email"`
		Locale  string `json:"locale"`
		Consent bool   `json:"consent"`
	}
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	actor := actorFrom(r.Context())
	code := r.PathValue("code")
	var err error
	switch r.PathValue("action") {
	case "check-in", "readiness", "cancel":
		err = s.app.UrgentAction(r.Context(), actor, code, r.PathValue("action"), in.Value, in.Verified)
	case "link-client":
		err = s.app.UrgentAction(r.Context(), actor, code, "link", in.Value, in.Verified)
	case "guest-client":
		var id string
		id, err = s.app.UrgentGuest(r.Context(), actor, code, in.Verified)
		if err == nil {
			writeJSON(w, 200, map[string]string{"clientId": id})
			return
		}
	case "assign":
		err = s.app.AssignUrgent(r.Context(), actor, code, in.UrgentAssignment)
	case "confirm":
		var created any
		created, err = s.app.ConfirmUrgent(r.Context(), actor, code)
		if err == nil {
			writeJSON(w, 200, created)
			return
		}
	case "complete":
		err = s.app.CompleteUrgent(r.Context(), actor, code)
	case "invite", "change-email":
		purpose := "activate"
		if r.PathValue("action") == "change-email" {
			purpose = "change_email"
		}
		err = s.app.InviteUrgentClient(r.Context(), actor, code, in.Email, purpose, in.Locale, in.Consent && in.Verified)
	default:
		err = app.ErrBadRequest
	}
	if err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(204)
}

func (s *server) clientActivate(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if err := s.app.ActivateUrgentClient(r.Context(), in.Token, in.Password); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(204)
}

func (s *server) clientAccessDetails(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token string `json:"token"`
	}
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	purpose, err := s.app.ClientAccountPurpose(r.Context(), in.Token)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]string{"purpose": purpose})
}

func (s *server) urgentLocation(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Address  string `json:"address"`
		MapsURL  string `json:"mapsUrl"`
		Verified bool   `json:"verified"`
	}
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if err := s.app.UrgentLocation(r.Context(), actorFrom(r.Context()), r.PathValue("id"), in.Address, in.MapsURL, in.Verified); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(204)
}

func (s *server) myUrgent(w http.ResponseWriter, r *http.Request) {
	requests, err := s.app.ClientUrgentRequests(r.Context(), actorFrom(r.Context()))
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"requests": requests})
}
