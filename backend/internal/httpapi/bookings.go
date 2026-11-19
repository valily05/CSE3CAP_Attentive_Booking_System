package httpapi

import (
	"net/http"
	"time"

	"careconnect/internal/app"
	"careconnect/internal/domain/wib"
	"careconnect/internal/store"
)

type bookRequest struct {
	ClientID       string    `json:"clientId"`
	PsychologistID string    `json:"psychologistId"`
	ServiceID      string    `json:"serviceId"`
	Mode           string    `json:"mode"`
	OnlineChannel  string    `json:"onlineChannel"`
	LocationID     string    `json:"locationId"`
	Start          time.Time `json:"start"`
}

func (s *server) book(w http.ResponseWriter, r *http.Request) {
	var in bookRequest
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	created, err := s.app.Book(r.Context(), actorFrom(r.Context()), app.BookInput(in))
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

// bookingFilter reads ?status=&from=YYYY-MM-DD&to=YYYY-MM-DD&location=
func bookingFilter(r *http.Request) (store.BookingFilter, error) {
	q := r.URL.Query()
	f := store.BookingFilter{Status: q.Get("status"), LocationID: q.Get("location")}
	for key, dst := range map[string]*time.Time{"from": &f.From, "to": &f.To} {
		if v := q.Get(key); v != "" {
			t, err := time.ParseInLocation(time.DateOnly, v, wib.Zone)
			if err != nil {
				return f, app.ErrBadRequest
			}
			*dst = t
		}
	}
	if !f.To.IsZero() {
		f.To = f.To.AddDate(0, 0, 1) // "to" is inclusive for people
	}
	return f, nil
}

func (s *server) myBookings(w http.ResponseWriter, r *http.Request) {
	f, err := bookingFilter(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	bs, err := s.app.MyBookings(r.Context(), actorFrom(r.Context()), f)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"bookings": bs})
}

func (s *server) reschedule(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Start      time.Time `json:"start"`
		Mode       string    `json:"mode"`
		LocationID string    `json:"locationId"`
	}
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if err := s.app.Reschedule(r.Context(), actorFrom(r.Context()), r.PathValue("id"), app.RescheduleInput(in)); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) cancel(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Reason string `json:"reason"`
	}
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if err := s.app.Cancel(r.Context(), actorFrom(r.Context()), r.PathValue("id"), in.Reason); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
