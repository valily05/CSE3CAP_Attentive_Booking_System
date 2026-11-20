package httpapi

import (
	"errors"
	"net"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"

	"careconnect/internal/app"
	"careconnect/internal/store"
)

func (s *server) urgentRoutes(mux *http.ServeMux) {
	s.urgentLifecycleRoutes(mux)
	mux.HandleFunc("POST /api/urgent-requests", s.createUrgent)
	mux.HandleFunc("GET /api/urgent-requests/config", s.urgentConfig)
	mux.HandleFunc("POST /api/urgent-requests/receipt", s.urgentReceipt)
	mux.HandleFunc("GET /api/admin/urgent-requests", s.authed(s.urgentRequests, "admin"))
	mux.HandleFunc("PUT /api/admin/urgent-requests/{id}/status", s.authed(s.updateUrgent, "admin"))
}

func businessNumber() string {
	number := strings.TrimPrefix(strings.TrimSpace(os.Getenv("URGENT_WHATSAPP_NUMBER")), "+")
	if !regexp.MustCompile(`^[1-9][0-9]{7,14}$`).MatchString(number) {
		return ""
	}
	return number
}

func (s *server) urgentConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]string{"whatsappNumber": businessNumber()})
}

func (s *server) urgentLimited(w http.ResponseWriter, r *http.Request, key string, limit int) bool {
	allowed, err := s.app.AllowUrgent(r.Context(), key, limit)
	if err != nil {
		writeError(w, r, err)
		return true
	}
	if !allowed {
		w.Header().Set("Retry-After", "3600")
		writeJSON(w, 429, map[string]string{"error": "urgent_rate_limit"})
		return true
	}
	return false
}

func (s *server) createUrgent(w http.ResponseWriter, r *http.Request) {
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	// Forwarded headers are deliberately ignored unless a trusted proxy is configured.
	if s.urgentLimited(w, r, "urgent-ip:"+host, 20) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var in app.UrgentInput
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if s.urgentLimited(w, r, "urgent-email:"+strings.ToLower(strings.TrimSpace(in.Email)), 5) {
		return
	}
	result, token, err := s.app.CreateUrgent(r.Context(), in)
	if errors.Is(err, store.ErrUrgentCapacity) {
		writeJSON(w, 503, map[string]string{"error": "urgent_capacity"})
		return
	}
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, 201, map[string]any{"request": publicUrgentReceipt(result), "token": token})
}

func (s *server) urgentReceipt(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token string `json:"token"`
	}
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	result, err := s.app.UrgentReceipt(r.Context(), in.Token)
	if err != nil {
		writeError(w, r, err)
		return
	}
	// A bearer token permits a minimal receipt only. Contact details require admin access.
	recent, err := s.app.UrgentRecent(r.Context(), result)
	if err != nil {
		writeError(w, r, err)
		return
	}
	receipt := publicUrgentReceipt(result)
	receipt["recent"] = recent
	writeJSON(w, 200, receipt)
}

// Customer access exposes their receipt and arrival controls, with staff profile data omitted.
func publicUrgentReceipt(request store.UrgentRequest) map[string]any {
	w := request.Workflow
	return map[string]any{"id": request.ID, "bookingCode": request.BookingCode, "customerName": request.CustomerName,
		"sessionType": request.SessionType, "locationName": request.LocationName, "status": request.Status,
		"workflow": map[string]any{"submittedAt": w.SubmittedAt, "arrivalStatus": w.ArrivalStatus,
			"estimatedDepartureAt": w.EstimatedDepartureAt, "arrivalUpdatedAt": w.ArrivalUpdatedAt,
			"address": w.Address, "mapsUrl": w.MapsURL, "isUrgent": true}}
}

func (s *server) urgentRequests(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("token") == "" && r.URL.Query().Get("code") == "" {
		q := r.URL.Query()
		offset := 0
		if raw := q.Get("offset"); raw != "" {
			var err error
			offset, err = strconv.Atoi(raw)
			if err != nil {
				writeError(w, r, app.ErrBadRequest)
				return
			}
		}
		result, err := s.app.UrgentQueue(r.Context(), actorFrom(r.Context()), q.Get("q"), q.Get("status"), q.Get("mode"), q.Get("location"), offset)
		if err != nil {
			writeError(w, r, err)
			return
		}
		writeJSON(w, 200, result)
		return
	}
	result, err := s.app.UrgentRequests(r.Context(), actorFrom(r.Context()), r.URL.Query().Get("code"), r.URL.Query().Get("token"))
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"requests": result})
}

func (s *server) updateUrgent(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Status   string `json:"status"`
		Previous string `json:"previous"`
	}
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if err := s.app.UpdateUrgent(r.Context(), actorFrom(r.Context()), r.PathValue("id"), in.Status, in.Previous); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(204)
}
