package app

import (
	"context"
	"time"

	"careconnect/internal/domain/booking"
	"careconnect/internal/domain/schedule"
	"careconnect/internal/email"
	"careconnect/internal/store"
)

// CancelReasons is the fixed list a client can pick from. There is no
// free-text box: clients must not be invited to type private details.
var CancelReasons = []string{"", "schedule_conflict", "travel", "cost", "other"}

// visibleBooking loads a booking the actor may see. Anyone else gets
// ErrNotFound, so the API never reveals that a booking exists.
func (a *App) visibleBooking(ctx context.Context, act Actor, id string) (store.BookingView, error) {
	if !isUUID(id) {
		return store.BookingView{}, store.ErrNotFound
	}
	b, err := a.store.GetBooking(ctx, id)
	if err != nil {
		return b, err
	}
	switch {
	case act.IsAdmin(),
		act.Role == "client" && b.ClientID == act.ClientID,
		act.Role == "psychologist" && b.PsychologistID == act.PsychologistID:
		return b, nil
	}
	return store.BookingView{}, store.ErrNotFound
}

// changeable checks who may change a booking now. Admins always may.
func (a *App) changeable(ctx context.Context, act Actor, id string) (store.BookingView, store.Settings, error) {
	b, err := a.visibleBooking(ctx, act, id)
	if err != nil {
		return b, store.Settings{}, err
	}
	st, err := a.store.Settings(ctx)
	if err != nil {
		return b, st, err
	}
	switch {
	case act.IsAdmin():
	case act.Role != "client":
		return b, st, ErrForbidden
	case b.Status != string(booking.Confirmed):
		return b, st, store.ErrNotChangeable
	case !booking.ClientCanChange(b.Start, a.clock.Now(), st.ChangeCutoff):
		return b, st, ErrChangeWindowClosed
	}
	return b, st, nil
}

// RescheduleInput moves a booking. Mode and location are optional.
type RescheduleInput struct {
	Start      time.Time
	Mode       string
	LocationID string
}

// Reschedule moves a booking to a new open slot (admins: any free time).
func (a *App) Reschedule(ctx context.Context, act Actor, id string, in RescheduleInput) error {
	b, st, err := a.changeable(ctx, act, id)
	if err != nil {
		return err
	}
	place := BookInput{PsychologistID: b.PsychologistID, ServiceID: b.ServiceID, Mode: b.Mode, OnlineChannel: b.OnlineChannel, LocationID: b.LocationID, Start: in.Start}
	if in.Mode != "" {
		place.Mode, place.LocationID = in.Mode, in.LocationID
		if in.Mode == "in_person" {
			place.OnlineChannel = ""
		}
	}
	_, svc, err := a.checkPlace(ctx, place)
	if err != nil {
		return err
	}
	if !act.IsAdmin() {
		if err := booking.CheckLeadTime(in.Start, a.clock.Now(), st.MinLead); err != nil {
			return err
		}
		if err := a.mustBeOpenSlot(ctx, place, svc, id); err != nil {
			return err
		}
	}
	err = a.store.RescheduleBooking(ctx, store.Reschedule{
		BookingID: id, Start: in.Start, End: in.Start.Add(time.Duration(svc.LengthMinutes) * time.Minute), Break: st.Break,
		Mode: schedule.Mode(in.Mode), LocationID: place.LocationID, ActorID: act.UserID,
	})
	if err != nil {
		return err
	}
	a.emailClient(ctx, id, email.BookingChanged)
	a.emailPsychologist(ctx, id)
	return nil
}

// Cancel cancels a booking; the slot opens again.
func (a *App) Cancel(ctx context.Context, act Actor, id, reason string) error {
	if !oneOf(reason, CancelReasons...) {
		return ErrBadRequest
	}
	b, _, err := a.changeable(ctx, act, id)
	if err != nil {
		return err
	}
	if err := a.store.CancelBooking(ctx, store.Cancellation{BookingID: b.ID, Reason: reason, ActorID: act.UserID, At: a.clock.Now()}); err != nil {
		return err
	}
	a.emailClient(ctx, id, email.BookingCancelled)
	a.emailPsychologist(ctx, id)
	return nil
}

// emailPsychologist tells the psychologist a booking changed. It carries the
// client's first name only, like the "My schedule" page.
func (a *App) emailPsychologist(ctx context.Context, bookingID string) {
	b, err := a.store.GetBooking(ctx, bookingID)
	if err != nil {
		return
	}
	to, err := a.store.PsychologistEmail(ctx, b.PsychologistID)
	if err != nil || to == "" {
		return
	}
	d := a.bookingEmailData(b, firstName(b.ClientName))
	d.Link = a.base + "/schedule"
	a.send(ctx, to, "id", email.StaffBookingChanged, d)
}
