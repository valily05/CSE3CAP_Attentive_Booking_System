package store

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"careconnect/internal/domain/booking"
	"careconnect/internal/domain/schedule"
)

// ErrSlotTaken means another booking already holds that time.
var ErrSlotTaken = errors.New("sorry, this time was just taken")

const (
	pgExclusionViolation = "23P01"
	pgUniqueViolation    = "23505"
)

// NewBooking is a booking about to be made. Status is always Confirmed in
// Group 09's system (no payment step).
type NewBooking struct {
	ClientID, PsychologistID, ServiceID string
	Mode                                schedule.Mode
	OnlineChannel                       string // chat | voice | video when Mode is Online
	LocationID                          string // when Mode is InPerson
	Start, End                          time.Time
	Break                               time.Duration
	CreatedBy                           string // user ID; empty for system
}

// CreateBooking saves a confirmed booking and returns its ID and code.
// The database's exclusion constraint is the final word on double booking.
func (s *Store) CreateBooking(ctx context.Context, b NewBooking) (Created, error) {
	for range 5 { // retry the (very unlikely) case of a duplicate code
		code, err := booking.NewCode(rand.Reader)
		if err != nil {
			return Created{}, err
		}
		id, err := s.insertBooking(ctx, code, b)
		var pgErr *pgconn.PgError
		switch {
		case err == nil:
			return Created{ID: id, Code: code}, nil
		case errors.As(err, &pgErr) && pgErr.Code == pgExclusionViolation:
			return Created{}, ErrSlotTaken
		case errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation && pgErr.ConstraintName == "booking_code_key":
			continue
		default:
			return Created{}, fmt.Errorf("create booking: %w", err)
		}
	}
	return Created{}, errors.New("create booking: could not generate a unique code")
}

// insertBooking writes the booking and its history entry in one transaction.
func (s *Store) insertBooking(ctx context.Context, code string, b NewBooking) (string, error) {
	var id string
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `
			INSERT INTO booking (code, client_id, psychologist_id, service_id, mode, online_channel, location_id,
			                     start_at, end_at, blocked_until, status, created_by)
			VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), NULLIF($7, ''), $8, $9, $10, $11, NULLIF($12, '')::uuid)
			RETURNING id`,
			code, b.ClientID, b.PsychologistID, b.ServiceID, string(b.Mode), b.OnlineChannel, b.LocationID,
			b.Start, b.End, b.End.Add(b.Break), string(booking.Confirmed), b.CreatedBy).Scan(&id)
		if err != nil {
			return err
		}
		return audit(ctx, tx, b.CreatedBy, "created", id, map[string]any{"start": b.Start})
	})
	return id, err
}

// Created identifies a new booking.
type Created struct {
	ID             string    `json:"id"`
	Code           string    `json:"code"`
	ChangeDeadline time.Time `json:"changeDeadline"` // filled in by the app layer
}

// ErrNotFound means no such row (or not visible to the caller).
var ErrNotFound = errors.New("not found")

// Cancellation cancels one booking. ActorID is recorded in the audit history.
type Cancellation struct {
	BookingID string
	Reason    string // schedule_conflict | travel | cost | other, or empty
	ActorID   string
	At        time.Time
}

// CancelBooking marks a booking Cancelled, which frees its slot.
func (s *Store) CancelBooking(ctx context.Context, c Cancellation) error {
	return s.changeStatus(ctx, c.BookingID, booking.Cancelled, c.ActorID, c.At, c.Reason)
}

func (s *Store) changeStatus(ctx context.Context, bookingID string, to booking.Status, actorID string, at time.Time, reason string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var from string
	var start time.Time
	err = tx.QueryRow(ctx, `SELECT status, start_at FROM booking WHERE id = $1 FOR UPDATE`, bookingID).Scan(&from, &start)
	if err != nil {
		return notFound(err)
	}
	if err := booking.Transition(booking.Status(from), to, start, at); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE booking SET status = $2, cancel_reason = NULLIF($3, ''), updated_at = now() WHERE id = $1`,
		bookingID, string(to), reason); err != nil {
		return fmt.Errorf("change status: %w", err)
	}
	if err := audit(ctx, tx, actorID, "status:"+from+"→"+string(to), bookingID, nil); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ErrNotChangeable means the booking is no longer upcoming (e.g. cancelled).
var ErrNotChangeable = errors.New("this booking can no longer be changed")

// Reschedule moves a booking to a new time. It stays Confirmed and keeps its code.
type Reschedule struct {
	BookingID  string
	Start, End time.Time
	Break      time.Duration
	Mode       schedule.Mode // optional; empty keeps the current place
	LocationID string
	ActorID    string
}

// RescheduleBooking moves the booking in place, so the old slot is freed in
// the same statement that takes the new one.
func (s *Store) RescheduleBooking(ctx context.Context, r Reschedule) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var status string
	var oldStart time.Time
	if err := tx.QueryRow(ctx, `SELECT status, start_at FROM booking WHERE id = $1 FOR UPDATE`, r.BookingID).Scan(&status, &oldStart); err != nil {
		return notFound(err)
	}
	if booking.Status(status) != booking.Confirmed {
		return ErrNotChangeable
	}
	_, err = tx.Exec(ctx, `
		UPDATE booking SET start_at = $2, end_at = $3, blocked_until = $4,
		       mode = COALESCE(NULLIF($5, ''), mode),
		       location_id = CASE WHEN $5 = '' THEN location_id ELSE NULLIF($6, '') END,
		       updated_at = now()
		WHERE id = $1`, r.BookingID, r.Start, r.End, r.End.Add(r.Break), string(r.Mode), r.LocationID)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == pgExclusionViolation {
		return ErrSlotTaken
	}
	if err != nil {
		return fmt.Errorf("reschedule: %w", err)
	}
	if err := audit(ctx, tx, r.ActorID, "reschedule", r.BookingID, map[string]any{"from": oldStart, "to": r.Start}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// BookingView is a booking with the names needed to show it.
type BookingView struct {
	ID               string    `json:"id"`
	Code             string    `json:"code"`
	ClientID         string    `json:"clientId"`
	ClientName       string    `json:"clientName"`
	PsychologistID   string    `json:"psychologistId"`
	PsychologistName string    `json:"psychologistName"`
	ServiceID        string    `json:"serviceId"`
	ServiceName      string    `json:"serviceName"`
	Mode             string    `json:"mode"`
	OnlineChannel    string    `json:"onlineChannel,omitempty"`
	LocationID       string    `json:"locationId,omitempty"`
	LocationName     string    `json:"locationName,omitempty"`
	Start            time.Time `json:"start"`
	End              time.Time `json:"end"`
	Status           string    `json:"status"`
}

const bookingViewSQL = `
	SELECT b.id, b.code, b.client_id, c.name, b.psychologist_id, p.name, b.service_id, sv.name,
	       b.mode, COALESCE(b.online_channel, ''), COALESCE(b.location_id, ''), COALESCE(l.name, ''),
	       b.start_at, b.end_at, b.status
	FROM booking b
	JOIN client c        ON c.id = b.client_id
	JOIN psychologist p  ON p.id = b.psychologist_id
	JOIN service sv      ON sv.id = b.service_id
	LEFT JOIN location l ON l.id = b.location_id`

func scanBookingView(r pgx.CollectableRow) (BookingView, error) {
	var v BookingView
	err := r.Scan(&v.ID, &v.Code, &v.ClientID, &v.ClientName, &v.PsychologistID, &v.PsychologistName, &v.ServiceID, &v.ServiceName,
		&v.Mode, &v.OnlineChannel, &v.LocationID, &v.LocationName, &v.Start, &v.End, &v.Status)
	return v, err
}

// GetBooking returns one booking.
func (s *Store) GetBooking(ctx context.Context, id string) (BookingView, error) {
	rows, err := s.pool.Query(ctx, bookingViewSQL+` WHERE b.id = $1`, id)
	if err != nil {
		return BookingView{}, err
	}
	v, err := pgx.CollectExactlyOneRow(rows, scanBookingView)
	return v, notFound(err)
}
