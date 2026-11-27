package httpapi

import (
	"careconnect/internal/store"
	"net/http"
)

func (s *server) myProfile(w http.ResponseWriter, r *http.Request) {
	p, err := s.app.MyClientProfile(r.Context(), actorFrom(r.Context()))
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, 200, p)
}
func (s *server) saveProfile(w http.ResponseWriter, r *http.Request) {
	var p store.ClientProfile
	if err := decode(r, &p); err != nil {
		writeError(w, r, err)
		return
	}
	if err := s.app.UpdateClientProfile(r.Context(), actorFrom(r.Context()), p); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(204)
}
func (s *server) changeProfilePassword(w http.ResponseWriter, r *http.Request) {
	var p struct {
		CurrentPassword string `json:"currentPassword"`
		Password        string `json:"password"`
	}
	if err := decode(r, &p); err != nil {
		writeError(w, r, err)
		return
	}
	if err := s.app.ChangeProfilePassword(r.Context(), actorFrom(r.Context()), p.CurrentPassword, p.Password); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(204)
}
func (s *server) changeProfileEmail(w http.ResponseWriter, r *http.Request) {
	var p struct {
		CurrentPassword string `json:"currentPassword"`
		Email           string `json:"email"`
		Locale          string `json:"locale"`
	}
	if err := decode(r, &p); err != nil {
		writeError(w, r, err)
		return
	}
	if err := s.app.RequestProfileEmailChange(r.Context(), actorFrom(r.Context()), p.CurrentPassword, p.Email, p.Locale); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(204)
}
