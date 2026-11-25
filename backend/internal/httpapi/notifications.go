package httpapi

import "net/http"

func (s *server) myNotifications(w http.ResponseWriter, r *http.Request) {
	items, err := s.app.MyNotifications(r.Context(), actorFrom(r.Context()))
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}
func (s *server) readMyNotification(w http.ResponseWriter, r *http.Request) {
	if err := s.app.ReadMyNotification(r.Context(), actorFrom(r.Context()), r.PathValue("id")); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
func (s *server) dismissMyNotification(w http.ResponseWriter, r *http.Request) {
	if err := s.app.DismissMyNotification(r.Context(), actorFrom(r.Context()), r.PathValue("id")); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
