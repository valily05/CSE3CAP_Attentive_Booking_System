package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// audit appends to the history of changes (G09-9): who did what, when.
func audit(ctx context.Context, tx pgx.Tx, actorID, action, bookingID string, detail map[string]any) error {
	if detail == nil {
		detail = map[string]any{}
	}
	_, err := tx.Exec(ctx, `INSERT INTO audit_log (actor_id, action, booking_id, detail) VALUES (NULLIF($1, '')::uuid, $2, NULLIF($3, '')::uuid, $4)`,
		actorID, action, bookingID, detail)
	if err != nil {
		return fmt.Errorf("audit: %w", err)
	}
	return nil
}

func notFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}
