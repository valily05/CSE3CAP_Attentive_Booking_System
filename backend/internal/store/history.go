package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"careconnect/internal/domain/booking"
)

// ErrUnscoped protects against accidentally listing everyone's bookings.
var ErrUnscoped = errors.New("booking list needs a client, a psychologist or AllClients")

// BookingFilter lists bookings. Exactly who may see what is decided by the
// caller; the filter only refuses to run with no scope at all.
type BookingFilter struct {
	ClientID       string
	PsychologistID string
	AllClients     bool // admin only
	Status         string
	LocationID     string // or "online"
	From, To       time.Time
}

// ListBookings returns matching bookings, earliest first.
func (s *Store) ListBookings(ctx context.Context, f BookingFilter) ([]BookingView, error) {
	if f.ClientID == "" && f.PsychologistID == "" && !f.AllClients {
		return nil, ErrUnscoped
	}
	var where []string
	var args []any
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, fmt.Sprintf(cond, len(args)))
	}
	if f.ClientID != "" {
		add("b.client_id = $%d", f.ClientID)
	}
	if f.PsychologistID != "" {
		add("b.psychologist_id = $%d", f.PsychologistID)
	}
	if f.Status != "" {
		add("b.status = $%d", f.Status)
	}
	switch f.LocationID {
	case "":
	case "online":
		where = append(where, "b.mode = 'online'")
	default:
		add("b.location_id = $%d", f.LocationID)
	}
	if !f.From.IsZero() {
		add("b.start_at >= $%d", f.From)
	}
	if !f.To.IsZero() {
		add("b.start_at < $%d", f.To)
	}
	sql := bookingViewSQL
	if len(where) > 0 {
		sql += " WHERE " + strings.Join(where, " AND ")
	}
	rows, err := s.pool.Query(ctx, sql+" ORDER BY b.start_at", args...)
	if err != nil {
		return nil, fmt.Errorf("list bookings: %w", err)
	}
	return pgx.CollectRows(rows, scanBookingView)
}

// Attendance marks a past session Attended or No-show (or corrects it).
type Attendance struct {
	BookingID string
	Status    booking.Status
	ActorID   string
	At        time.Time
}

// MarkAttendance records whether the client came.
func (s *Store) MarkAttendance(ctx context.Context, a Attendance) error {
	return s.changeStatus(ctx, a.BookingID, a.Status, a.ActorID, a.At, "")
}
