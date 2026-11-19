package httpapi

import (
	"net/http"
	"time"

	"careconnect/internal/app"
	"careconnect/internal/domain/wib"
	"careconnect/internal/store"
)

func (s *server) adminRoutes(mux *http.ServeMux) {
	admin := func(h http.HandlerFunc) http.HandlerFunc { return s.authed(h, "admin") }
	mux.HandleFunc("GET /api/admin/bookings", admin(s.calendar))
	mux.HandleFunc("GET /api/admin/clients", admin(s.searchClients))
	mux.HandleFunc("POST /api/admin/clients", admin(s.createClient))
	mux.HandleFunc("GET /api/admin/psychologists/{psych}/hours", admin(s.getHours))
	mux.HandleFunc("PUT /api/admin/psychologists/{psych}/hours", admin(s.putHours))
	mux.HandleFunc("POST /api/admin/psychologists/{psych}/unavailability", admin(s.addUnavailability))
	mux.HandleFunc("GET /api/admin/settings", admin(s.getSettings))
	mux.HandleFunc("PUT /api/admin/settings", admin(s.putSettings))
	mux.HandleFunc("GET /api/admin/history", admin(s.history))
	mux.HandleFunc("GET /api/admin/reports", admin(s.report))
}

func (s *server) calendar(w http.ResponseWriter, r *http.Request) {
	f, err := bookingFilter(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	f.PsychologistID = r.URL.Query().Get("psychologist")
	bs, err := s.app.Calendar(r.Context(), actorFrom(r.Context()), f)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"bookings": bs})
}

func (s *server) searchClients(w http.ResponseWriter, r *http.Request) {
	cs, err := s.app.SearchClients(r.Context(), actorFrom(r.Context()), r.URL.Query().Get("q"))
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"clients": cs})
}

func (s *server) createClient(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name  string `json:"name"`
		Phone string `json:"phone"`
		Email string `json:"email"`
	}
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	id, err := s.app.AdminCreateClient(r.Context(), actorFrom(r.Context()), app.NewWalkInClient(in))
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// settingsJSON is Settings in the units admins think in.
type settingsJSON struct {
	MinLeadMinutes        int `json:"minLeadMinutes"`
	ChangeCutoffMinute    int `json:"changeCutoffMinute"`
	BreakMinutes          int `json:"breakMinutes"`
	ReminderFirstMinutes  int `json:"reminderFirstMinutes"`
	ReminderSecondMinutes int `json:"reminderSecondMinutes"`
	FollowUpDays          int `json:"followUpDays"`
	FollowUpCooldownDays  int `json:"followUpCooldownDays"`
}

const day = 24 * time.Hour

func (s *server) getSettings(w http.ResponseWriter, r *http.Request) {
	st, err := s.app.Settings(r.Context(), actorFrom(r.Context()))
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, settingsJSON{
		MinLeadMinutes: int(st.MinLead / time.Minute), ChangeCutoffMinute: int(st.ChangeCutoff / time.Minute),
		BreakMinutes: int(st.Break / time.Minute), ReminderFirstMinutes: int(st.ReminderFirst / time.Minute),
		ReminderSecondMinutes: int(st.ReminderSecond / time.Minute), FollowUpDays: int(st.FollowUpAfter / day),
		FollowUpCooldownDays: int(st.FollowUpCooldown / day),
	})
}

func (s *server) putSettings(w http.ResponseWriter, r *http.Request) {
	var in settingsJSON
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	m := func(n int) time.Duration { return time.Duration(n) * time.Minute }
	err := s.app.UpdateSettings(r.Context(), actorFrom(r.Context()), store.Settings{
		MinLead: m(in.MinLeadMinutes), ChangeCutoff: m(in.ChangeCutoffMinute), Break: m(in.BreakMinutes),
		ReminderFirst: m(in.ReminderFirstMinutes), ReminderSecond: m(in.ReminderSecondMinutes),
		FollowUpAfter: time.Duration(in.FollowUpDays) * day, FollowUpCooldown: time.Duration(in.FollowUpCooldownDays) * day,
	})
	if err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) history(w http.ResponseWriter, r *http.Request) {
	h, err := s.app.History(r.Context(), actorFrom(r.Context()))
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": h})
}

func (s *server) report(w http.ResponseWriter, r *http.Request) {
	start, err := time.ParseInLocation(time.DateOnly, r.URL.Query().Get("start"), wib.Zone)
	if err != nil {
		writeError(w, r, app.ErrBadRequest)
		return
	}
	rep, err := s.app.Report(r.Context(), actorFrom(r.Context()), r.URL.Query().Get("period"), start)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, rep)
}
