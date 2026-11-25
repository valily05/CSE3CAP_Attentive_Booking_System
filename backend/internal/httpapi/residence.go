package httpapi

import (
	"careconnect/internal/app"
	"net/http"
)

func (s *server) myResidence(w http.ResponseWriter, r *http.Request) {
	value, err := s.app.MyResidence(r.Context(), actorFrom(r.Context()))
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, 200, value)
}
func (s *server) updateResidence(w http.ResponseWriter, r *http.Request) {
	var value app.Residence
	if err := decode(r, &value); err != nil {
		writeError(w, r, err)
		return
	}
	if err := s.app.UpdateResidence(r.Context(), actorFrom(r.Context()), value); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
