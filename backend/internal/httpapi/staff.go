package httpapi

import (
	"fmt"
	"net/http"
	"time"

	"careconnect/internal/app"
	"careconnect/internal/domain/schedule"
	"careconnect/internal/store"
)

// hoursJSON is weekly hours as people write them: "09:00".
type hoursJSON struct {
	Weekday    int    `json:"weekday"` // 0 = Sunday
	Start      string `json:"start"`
	End        string `json:"end"`
	Mode       string `json:"mode"`
	LocationID string `json:"locationId,omitempty"`
}

func clockText(m schedule.Minute) string { return fmt.Sprintf("%02d:%02d", m/60, m%60) }

func parseClock(s string) (schedule.Minute, error) {
	t, err := time.Parse("15:04", s)
	if err != nil {
		return 0, app.ErrBadRequest
	}
	return schedule.HM(t.Hour(), t.Minute()), nil
}

func toJSON(hs []schedule.WeeklyHours) []hoursJSON {
	out := make([]hoursJSON, len(hs))
	for i, h := range hs {
		out[i] = hoursJSON{Weekday: int(h.Weekday), Start: clockText(h.Start), End: clockText(h.End), Mode: string(h.Mode), LocationID: h.LocationID}
	}
	return out
}

func fromJSON(in []hoursJSON) ([]schedule.WeeklyHours, error) {
	out := make([]schedule.WeeklyHours, len(in))
	for i, h := range in {
		start, err := parseClock(h.Start)
		if err != nil {
			return nil, err
		}
		end, err := parseClock(h.End)
		if err != nil {
			return nil, err
		}
		if h.End == "24:00" {
			end = schedule.HM(24, 0)
		}
		if h.Weekday < 0 || h.Weekday > 6 || (h.Mode != "online" && h.Mode != "in_person") {
			return nil, app.ErrBadRequest
		}
		out[i] = schedule.WeeklyHours{Weekday: time.Weekday(h.Weekday), Start: start, End: end, Mode: schedule.Mode(h.Mode), LocationID: h.LocationID}
	}
	return out, nil
}

func (s *server) getHours(w http.ResponseWriter, r *http.Request) {
	hs, err := s.app.Hours(r.Context(), actorFrom(r.Context()), r.PathValue("psych"))
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"hours": toJSON(hs)})
}

func (s *server) putHours(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Hours []hoursJSON `json:"hours"`
	}
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	hs, err := fromJSON(in.Hours)
	if err != nil {
		writeError(w, r, err)
		return
	}
	warnings, err := s.app.SetHours(r.Context(), actorFrom(r.Context()), r.PathValue("psych"), hs)
	if err != nil {
		writeError(w, r, err)
		return
	}
	if len(warnings) > 0 {
		writeJSON(w, http.StatusOK, map[string]any{"bookingsOutsideHours": warnings})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) addUnavailability(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Kind  string    `json:"kind"`
		Label string    `json:"label"`
		Start time.Time `json:"start"`
		End   time.Time `json:"end"`
	}
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	err := s.app.AddUnavailability(r.Context(), actorFrom(r.Context()), store.Unavailability{
		PsychologistID: r.PathValue("psych"), Kind: in.Kind, Label: in.Label, Start: in.Start, End: in.End,
	})
	if err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

func (s *server) mySchedule(w http.ResponseWriter, r *http.Request) {
	f, err := bookingFilter(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	bs, err := s.app.MySchedule(r.Context(), actorFrom(r.Context()), f)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"bookings": bs})
}

func (s *server) attendance(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Status string `json:"status"`
	}
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if err := s.app.MarkAttendance(r.Context(), actorFrom(r.Context()), r.PathValue("id"), in.Status); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
