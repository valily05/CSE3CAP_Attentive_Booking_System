package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"careconnect/internal/domain/booking"
	"careconnect/internal/domain/notify"
)

// ErrAlreadySent means this message was already logged for this booking.
var ErrAlreadySent = errors.New("message already sent")

// Message is one entry in the message log. BookingID is empty for follow-ups.
type Message struct {
	ClientID  string
	BookingID string
	Kind      notify.Kind
}

// RecordMessage logs a message. The unique index makes it at-most-once
// per booking and kind, even with two schedulers running.
func (s *Store) RecordMessage(ctx context.Context, m Message) error {
	_, err := s.pool.Exec(ctx, `INSERT INTO message_log (client_id, booking_id, kind) VALUES ($1, NULLIF($2, '')::uuid, $3)`,
		m.ClientID, m.BookingID, string(m.Kind))
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
		return ErrAlreadySent
	}
	if err != nil {
		return fmt.Errorf("record message: %w", err)
	}
	return nil
}

// ReminderCandidates returns confirmed bookings starting in [from, to] (both
// ends included, so a session exactly 24h away is found at the 24h mark)
// with the reminder kinds already sent for each.
func (s *Store) ReminderCandidates(ctx context.Context, from, to time.Time) ([]notify.ReminderCandidate, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT b.id, b.start_at, b.status,
		       COALESCE(array_agg(m.kind) FILTER (WHERE m.kind IS NOT NULL), '{}')
		FROM booking b
		LEFT JOIN message_log m ON m.booking_id = b.id
		WHERE b.status = $3 AND b.start_at >= $1 AND b.start_at <= $2
		GROUP BY b.id
		ORDER BY b.start_at`, from, to, string(booking.Confirmed))
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (notify.ReminderCandidate, error) {
		var c notify.ReminderCandidate
		var status string
		var sent []string
		err := r.Scan(&c.BookingID, &c.Start, &status, &sent)
		c.Status = booking.Status(status)
		for _, k := range sent {
			c.Sent = append(c.Sent, notify.Kind(k))
		}
		return c, err
	})
}
