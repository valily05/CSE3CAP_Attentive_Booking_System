package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"careconnect/internal/domain/booking"
	"careconnect/internal/domain/notify"
)

// FollowUpRow is a consenting client plus the facts G09-8 needs. It carries
// the first name only: the email greets the client and says nothing else.
type FollowUpRow struct {
	notify.FollowUpCandidate
	ClientID         string
	FirstName        string
	Email            string
	Locale           string
	UnsubscribeToken string
}

// FollowUpCandidates lists clients who agreed to check-ins and have not
// unsubscribed. The domain rule decides which of them are actually due.
func (s *Store) FollowUpCandidates(ctx context.Context, now time.Time) ([]FollowUpRow, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT c.id, c.name, c.email, c.locale, c.unsubscribe_token, c.agreed_to_messages, c.unsubscribed,
		       last.start_at, COALESCE(last.status, ''),
		       EXISTS (SELECT 1 FROM booking u WHERE u.client_id = c.id AND u.status = 'confirmed' AND u.start_at > $1),
		       (SELECT max(sent_at) FROM message_log m WHERE m.client_id = c.id AND m.kind = $2)
		FROM client c
		LEFT JOIN LATERAL (
		    SELECT start_at, status FROM booking b
		    WHERE b.client_id = c.id AND b.start_at <= $1 AND b.status IN ('attended', 'no_show', 'confirmed')
		    ORDER BY b.start_at DESC LIMIT 1
		) last ON true
		WHERE c.agreed_to_messages AND NOT c.unsubscribed`, now, string(notify.FollowUp))
	if err != nil {
		return nil, fmt.Errorf("follow-up candidates: %w", err)
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (FollowUpRow, error) {
		var f FollowUpRow
		var name, status string
		var last, followUp *time.Time
		err := r.Scan(&f.ClientID, &name, &f.Email, &f.Locale, &f.UnsubscribeToken, &f.OptedIn, &f.Unsubscribed,
			&last, &status, &f.HasUpcoming, &followUp)
		f.FirstName, _, _ = strings.Cut(strings.TrimSpace(name), " ")
		f.LastSessionStatus = booking.Status(status)
		if last != nil {
			f.LastSessionAt = *last
		}
		if followUp != nil {
			f.LastFollowUpAt = *followUp
		}
		return f, err
	})
}

// Unsubscribe stops check-in emails for the client owning token. It needs
// no login, so the link in the email works in one click.
func (s *Store) Unsubscribe(ctx context.Context, token string) error {
	tag, err := s.pool.Exec(ctx, `UPDATE client SET unsubscribed = true WHERE unsubscribe_token = $1`, token)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
