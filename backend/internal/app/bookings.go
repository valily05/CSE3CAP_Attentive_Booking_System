package app

import (
	"context"
	"errors"
	"slices"
	"time"

	"careconnect/internal/domain/booking"
	"careconnect/internal/domain/schedule"
	"careconnect/internal/email"
	"careconnect/internal/store"
)

// ErrChannelRequired means an online booking did not say chat, voice or video.
var ErrChannelRequired = errors.New("online sessions need chat, voice or video")

// BookInput is a booking request.
type BookInput struct {
	ClientID       string // set by admin; ignored for clients (they book for themselves)
	PsychologistID string
	ServiceID      string
	Mode           string // online | in_person
	OnlineChannel  string // chat | voice | video
	LocationID     string
	Start          time.Time
}

// Book makes a booking. Clients must pick an open slot at least the minimum
// lead time ahead; admins may break those rules (it is recorded), but even
// they can never double-book.
func (a *App) Book(ctx context.Context, act Actor, in BookInput) (store.Created, error) {
	switch {
	case act.Role == "client":
		in.ClientID = act.ClientID
	case act.IsAdmin():
		if in.ClientID == "" {
			return store.Created{}, ErrBadRequest
		}
	default:
		return store.Created{}, ErrForbidden
	}
	_, svc, err := a.checkPlace(ctx, in)
	if err != nil {
		return store.Created{}, err
	}
	st, err := a.store.Settings(ctx)
	if err != nil {
		return store.Created{}, err
	}
	end := in.Start.Add(time.Duration(svc.LengthMinutes) * time.Minute)
	if !act.IsAdmin() {
		if err := booking.CheckLeadTime(in.Start, a.clock.Now(), st.MinLead); err != nil {
			return store.Created{}, err
		}
		if err := a.mustBeOpenSlot(ctx, in, svc, ""); err != nil {
			return store.Created{}, err
		}
	}
	created, err := a.store.CreateBooking(ctx, store.NewBooking{
		ClientID: in.ClientID, PsychologistID: in.PsychologistID, ServiceID: in.ServiceID,
		Mode: schedule.Mode(in.Mode), OnlineChannel: in.OnlineChannel, LocationID: in.LocationID,
		Start: in.Start, End: end, Break: st.Break, CreatedBy: act.UserID,
	})
	if err != nil {
		return store.Created{}, err
	}
	created.ChangeDeadline = booking.ChangeDeadline(in.Start, st.ChangeCutoff)
	a.emailClient(ctx, created.ID, email.BookingConfirmed)
	return created, nil
}

// checkPlace validates mode, channel and location against what the
// psychologist offers.
func (a *App) checkPlace(ctx context.Context, in BookInput) (store.PsychologistCard, store.Service, error) {
	psych, err := a.Psychologist(ctx, in.PsychologistID)
	if err != nil {
		return psych, store.Service{}, err
	}
	if !slices.Contains(psych.ServiceIDs, in.ServiceID) {
		return psych, store.Service{}, ErrServiceNotOffered
	}
	svc, err := a.store.GetService(ctx, in.ServiceID)
	if err != nil {
		return psych, svc, err
	}
	switch in.Mode {
	case "online":
		if in.OnlineChannel == "" {
			return psych, svc, ErrChannelRequired
		}
		if in.LocationID != "" || !slices.Contains(psych.SessionTypes, in.OnlineChannel) {
			return psych, svc, ErrBadRequest
		}
	case "in_person":
		if in.OnlineChannel != "" || !slices.Contains(psych.SessionTypes, "in_person") || !slices.Contains(psych.LocationIDs, in.LocationID) {
			return psych, svc, ErrBadRequest
		}
	default:
		return psych, svc, ErrBadRequest
	}
	return psych, svc, nil
}

// mustBeOpenSlot accepts only a start time on the open-slot grid. If the
// time is closed only because someone else just booked it, the client is
// told exactly that ("Sorry, this time was just taken").
func (a *App) mustBeOpenSlot(ctx context.Context, in BookInput, svc store.Service, movingBookingID string) error {
	q := SlotQuery{PsychologistID: in.PsychologistID, ServiceID: svc.ID, From: in.Start, Days: 1, Mode: in.Mode, LocationID: in.LocationID, excludeBookingID: movingBookingID}
	open, err := a.slotExists(ctx, q, in.Start)
	if err != nil || open {
		return err
	}
	q.ignoreBooked = true
	if wouldBeOpen, err := a.slotExists(ctx, q, in.Start); err != nil {
		return err
	} else if wouldBeOpen {
		return store.ErrSlotTaken
	}
	return ErrSlotUnavailable
}

func (a *App) slotExists(ctx context.Context, q SlotQuery, start time.Time) (bool, error) {
	days, err := a.Slots(ctx, q)
	if err != nil {
		return false, err
	}
	for _, s := range days[0].Slots {
		if s.Start.Equal(start) {
			return true, nil
		}
	}
	return false, nil
}

// emailClient sends a booking email to the booking's client.
func (a *App) emailClient(ctx context.Context, bookingID string, k email.Kind) {
	b, err := a.store.GetBooking(ctx, bookingID)
	if err != nil {
		a.log.ErrorContext(ctx, "email: load booking", "err", err)
		return
	}
	c, err := a.store.ClientContact(ctx, b.ClientID)
	if err != nil {
		a.log.ErrorContext(ctx, "email: load client", "err", err)
		return
	}
	a.send(ctx, c.Email, c.Locale, k, a.bookingEmailData(b, firstName(c.Name)))
}

func (a *App) bookingEmailData(b store.BookingView, name string) email.Data {
	return email.Data{
		FirstName: name, Start: b.Start, Psychologist: b.PsychologistName, Place: b.LocationName,
		Code: b.Code, Link: a.base + "/bookings",
	}
}

// ClientBooking is a client's own booking plus whether they may still change it.
type ClientBooking struct {
	store.BookingView
	CanChange      bool      `json:"canChange"`
	ChangeDeadline time.Time `json:"changeDeadline"`
}

// MyBookings lists the signed-in client's bookings (visit history).
func (a *App) MyBookings(ctx context.Context, act Actor, f store.BookingFilter) ([]ClientBooking, error) {
	if act.Role != "client" {
		return nil, ErrForbidden
	}
	f.ClientID, f.PsychologistID, f.AllClients = act.ClientID, "", false
	bs, err := a.store.ListBookings(ctx, f)
	if err != nil {
		return nil, err
	}
	st, err := a.store.Settings(ctx)
	if err != nil {
		return nil, err
	}
	now := a.clock.Now()
	out := make([]ClientBooking, len(bs))
	for i, b := range bs {
		out[i] = ClientBooking{BookingView: b, ChangeDeadline: booking.ChangeDeadline(b.Start, st.ChangeCutoff),
			CanChange: b.Status == string(booking.Confirmed) && booking.ClientCanChange(b.Start, now, st.ChangeCutoff)}
	}
	return out, nil
}
