package store

import (
	"context"
	"github.com/jackc/pgx/v5"
	"time"
)

type AccountNotification struct {
	ID        string         `json:"id"`
	Kind      string         `json:"kind"`
	CreatedAt time.Time      `json:"createdAt"`
	Read      bool           `json:"read"`
	Details   map[string]any `json:"details"`
}

func (s *Store) CreateSessionWithWelcome(ctx context.Context, hash []byte, userID string, expires, now time.Time, welcome bool) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO auth_session(token_hash,user_id,expires_at) VALUES($1,$2,$3)`, hash, userID, expires); err != nil {
			return err
		}
		if welcome {
			_, err := tx.Exec(ctx, `INSERT INTO account_notification(user_id,kind,created_at) VALUES($1,'welcome',$2) ON CONFLICT(user_id,kind) WHERE kind='welcome' DO NOTHING`, userID, now)
			return err
		}
		return nil
	})
}
func (s *Store) AccountNotifications(ctx context.Context, userID string) ([]AccountNotification, error) {
	rows, err := s.pool.Query(ctx, `SELECT id,kind,created_at,read_at IS NOT NULL,details FROM account_notification WHERE user_id=$1 AND dismissed_at IS NULL ORDER BY created_at DESC LIMIT 30`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []AccountNotification{}
	for rows.Next() {
		var item AccountNotification
		if err = rows.Scan(&item.ID, &item.Kind, &item.CreatedAt, &item.Read, &item.Details); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (s *Store) ReadAccountNotification(ctx context.Context, userID, id string, now time.Time) error {
	tag, err := s.pool.Exec(ctx, `UPDATE account_notification SET read_at=COALESCE(read_at,$3) WHERE id::text=$1 AND user_id=$2 AND dismissed_at IS NULL`, id, userID, now)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
func (s *Store) DismissAccountNotification(ctx context.Context, userID, id string, now time.Time) error {
	tag, err := s.pool.Exec(ctx, `UPDATE account_notification SET dismissed_at=COALESCE(dismissed_at,$3) WHERE id::text=$1 AND user_id=$2`, id, userID, now)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) ReadAllAccountNotifications(ctx context.Context, userID string, now time.Time) error {
	_, err := s.pool.Exec(ctx, `UPDATE account_notification SET read_at=$2 WHERE user_id=$1 AND read_at IS NULL AND dismissed_at IS NULL`, userID, now)
	return err
}
