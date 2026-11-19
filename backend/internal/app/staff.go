package app

import (
	"context"

	"careconnect/internal/domain/booking"
	"careconnect/internal/domain/schedule"
	"careconnect/internal/store"
)

// ownPsychologist resolves which psychologist an actor may manage:
// a psychologist manages themself, an admin manages anyone.
func ownPsychologist(act Actor, requested string) (string, error) {
	switch {
	case act.Role == "psychologist":
		return act.PsychologistID, nil
	case act.IsAdmin() && requested != "":
		return requested, nil
	case act.IsAdmin():
		return "", ErrBadRequest
	}
	return "", ErrForbidden
}

// Hours returns a psychologist's weekly hours.
func (a *App) Hours(ctx context.Context, act Actor, psychID string) ([]schedule.WeeklyHours, error) {
	id, err := ownPsychologist(act, psychID)
	if err != nil {
		return nil, err
	}
	return a.store.WeeklyHours(ctx, id)
}

// SetHours replaces weekly hours. Bookings that no longer fit are kept and
// returned as warnings for the admin (G09-3).
func (a *App) SetHours(ctx context.Context, act Actor, psychID string, hours []schedule.WeeklyHours) ([]string, error) {
	id, err := ownPsychologist(act, psychID)
	if err != nil {
		return nil, err
	}
	if err := a.store.SetWeeklyHours(ctx, id, hours); err != nil {
		return nil, err
	}
	return a.outsideHours(ctx, id, hours)
}

func (a *App) outsideHours(ctx context.Context, psychID string, hours []schedule.WeeklyHours) ([]string, error) {
	upcoming, err := a.store.ListBookings(ctx, store.BookingFilter{PsychologistID: psychID, Status: string(booking.Confirmed), From: a.clock.Now()})
	if err != nil {
		return nil, err
	}
	placed := make([]schedule.PlacedBooking, len(upcoming))
	codes := map[string]string{}
	for i, b := range upcoming {
		placed[i] = schedule.PlacedBooking{ID: b.ID, Start: b.Start, End: b.End, Mode: schedule.Mode(b.Mode), LocationID: b.LocationID}
		codes[b.ID] = b.Code
	}
	out := []string{}
	for _, id := range schedule.BookingsOutsideHours(hours, placed) {
		out = append(out, codes[id])
	}
	return out, nil
}

// AddUnavailability records time off or a block.
func (a *App) AddUnavailability(ctx context.Context, act Actor, u store.Unavailability) error {
	id, err := ownPsychologist(act, u.PsychologistID)
	if err != nil {
		return err
	}
	if !oneOf(u.Kind, "time_off", "block") || !u.End.After(u.Start) {
		return ErrBadRequest
	}
	u.PsychologistID = id
	return a.store.AddUnavailability(ctx, u)
}

// MySchedule lists a psychologist's own bookings with client first names only.
func (a *App) MySchedule(ctx context.Context, act Actor, f store.BookingFilter) ([]store.BookingView, error) {
	if act.Role != "psychologist" {
		return nil, ErrForbidden
	}
	f.PsychologistID, f.ClientID, f.AllClients = act.PsychologistID, "", false
	bs, err := a.store.ListBookings(ctx, f)
	for i := range bs {
		bs[i].ClientName = firstName(bs[i].ClientName)
	}
	return bs, err
}

// MarkAttendance records Attended or No-show (psychologist for their own
// sessions, or admin).
func (a *App) MarkAttendance(ctx context.Context, act Actor, id, status string) error {
	if act.Role != "psychologist" && !act.IsAdmin() {
		return ErrForbidden
	}
	if !oneOf(status, string(booking.Attended), string(booking.NoShow)) {
		return ErrBadRequest
	}
	if _, err := a.visibleBooking(ctx, act, id); err != nil {
		return err
	}
	return a.store.MarkAttendance(ctx, store.Attendance{BookingID: id, Status: booking.Status(status), ActorID: act.UserID, At: a.clock.Now()})
}
