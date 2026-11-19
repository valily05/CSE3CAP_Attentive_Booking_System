package app

import (
	"context"
	"errors"
	"net/url"

	"careconnect/internal/domain/notify"
	"careconnect/internal/email"
	"careconnect/internal/store"
)

// RunReminders sends due session reminders (G09-6). The scheduler calls it
// every 15 minutes. Each reminder is logged before it is sent, so even two
// overlapping runs cannot send it twice.
func (a *App) RunReminders(ctx context.Context) error {
	now := a.clock.Now()
	st, err := a.store.Settings(ctx)
	if err != nil {
		return err
	}
	cands, err := a.store.ReminderCandidates(ctx, now, now.Add(st.ReminderFirst))
	if err != nil {
		return err
	}
	for _, r := range notify.DueReminders(cands, now, notify.ReminderOffsets{First: st.ReminderFirst, Second: st.ReminderSecond}) {
		b, err := a.store.GetBooking(ctx, r.BookingID)
		if err != nil {
			return err
		}
		err = a.store.RecordMessage(ctx, store.Message{ClientID: b.ClientID, BookingID: b.ID, Kind: r.Kind})
		if errors.Is(err, store.ErrAlreadySent) {
			continue
		}
		if err != nil {
			return err
		}
		c, err := a.store.ClientContact(ctx, b.ClientID)
		if err != nil {
			return err
		}
		d := a.bookingEmailData(b, firstName(c.Name))
		d.AttendLink = a.base + "/bookings?attend=" + url.QueryEscape(b.Code)
		a.send(ctx, c.Email, c.Locale, email.Reminder, d)
	}
	return nil
}

// RunFollowUps sends one gentle check-in to clients who stopped coming
// (G09-8). The scheduler calls it once a day.
func (a *App) RunFollowUps(ctx context.Context) error {
	now := a.clock.Now()
	st, err := a.store.Settings(ctx)
	if err != nil {
		return err
	}
	rules := notify.FollowUpRules{Inactivity: st.FollowUpAfter, Cooldown: st.FollowUpCooldown}
	rows, err := a.store.FollowUpCandidates(ctx, now)
	if err != nil {
		return err
	}
	for _, r := range rows {
		if !notify.FollowUpEligible(r.FollowUpCandidate, now, rules) {
			continue
		}
		if err := a.store.RecordMessage(ctx, store.Message{ClientID: r.ClientID, Kind: notify.FollowUp}); err != nil {
			return err
		}
		a.send(ctx, r.Email, r.Locale, email.FollowUp, email.Data{
			FirstName:       r.FirstName,
			Link:            a.base + "/psychologists",
			UnsubscribeLink: a.base + "/unsubscribe?token=" + url.QueryEscape(r.UnsubscribeToken),
		})
	}
	return nil
}

// Unsubscribe stops check-in emails. It needs no login (one click).
func (a *App) Unsubscribe(ctx context.Context, token string) error {
	if token == "" {
		return store.ErrNotFound
	}
	return a.store.Unsubscribe(ctx, token)
}
