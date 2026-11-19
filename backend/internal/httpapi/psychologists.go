package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"careconnect/internal/app"
	"careconnect/internal/domain/wib"
	"careconnect/internal/store"
)

func (s *server) catalog(w http.ResponseWriter, r *http.Request) {
	c, err := s.app.Catalog(r.Context())
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (s *server) searchPsychologists(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	ps, err := s.app.SearchPsychologists(r.Context(), store.PsychologistFilter{
		AgeGroup: q.Get("ageGroup"), Mode: q.Get("mode"), LocationID: q.Get("location"),
	})
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"psychologists": ps})
}

func (s *server) psychologist(w http.ResponseWriter, r *http.Request) {
	p, err := s.app.Profile(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *server) slots(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from, err := time.ParseInLocation(time.DateOnly, q.Get("from"), wib.Zone)
	if err != nil {
		writeError(w, r, app.ErrBadRequest)
		return
	}
	days, err := strconv.Atoi(q.Get("days"))
	if err != nil {
		days = 7
	}
	out, err := s.app.Slots(r.Context(), app.SlotQuery{
		PsychologistID: r.PathValue("id"), ServiceID: q.Get("service"), From: from, Days: days,
		Mode: q.Get("mode"), LocationID: q.Get("location"),
	})
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"days": out})
}
