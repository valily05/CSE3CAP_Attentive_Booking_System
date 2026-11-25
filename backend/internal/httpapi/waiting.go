package httpapi

import (
	"careconnect/internal/store"
	"net/http"
)

func (s *server) waitingOptions(w http.ResponseWriter, r *http.Request) {
	out, err := s.app.WaitingOptions(r.Context())
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, 200, out)
}
func (s *server) joinWaiting(w http.ResponseWriter, r *http.Request) {
	var in store.WaitingRequest
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	out, err := s.app.JoinWaiting(r.Context(), actorFrom(r.Context()), in)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, 201, out)
}
func (s *server) myWaiting(w http.ResponseWriter, r *http.Request) {
	out, err := s.app.MyWaiting(r.Context(), actorFrom(r.Context()))
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"items": out})
}
func (s *server) removeWaiting(w http.ResponseWriter, r *http.Request) {
	if err := s.app.RemoveWaiting(r.Context(), actorFrom(r.Context()), r.PathValue("id")); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(204)
}
func (s *server) fulfillWaiting(w http.ResponseWriter, r *http.Request) {
	if err := s.app.FulfillWaiting(r.Context(), actorFrom(r.Context()), r.PathValue("id")); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(204)
}
