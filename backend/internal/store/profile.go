package store

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"time"
)

type ClientProfile struct {
	Name         string `json:"name"`
	Email        string `json:"email"`
	Phone        string `json:"phone"`
	Country      string `json:"country"`
	OtherCountry string `json:"otherCountry"`
	City         string `json:"city"`
	TimeZone     string `json:"timeZone"`
	PendingEmail string `json:"pendingEmail"`
}

func (s *Store) ClientProfile(ctx context.Context, userID string, now time.Time) (ClientProfile, error) {
	var p ClientProfile
	err := s.pool.QueryRow(ctx, `SELECT c.name,c.email,c.phone,c.residence_country,c.residence_other_country,c.residence_city,c.residence_timezone,COALESCE(e.email,'') FROM client c LEFT JOIN profile_email_change e ON e.user_id=c.user_id AND e.expires_at>$2 WHERE c.user_id=$1`, userID, now).Scan(&p.Name, &p.Email, &p.Phone, &p.Country, &p.OtherCountry, &p.City, &p.TimeZone, &p.PendingEmail)
	return p, notFound(err)
}
func (s *Store) UpdateClientProfile(ctx context.Context, userID string, p ClientProfile) error {
	tag, err := s.pool.Exec(ctx, `UPDATE client SET name=$2,phone=$3,residence_country=$4,residence_other_country=$5,residence_city=$6,residence_timezone=$7 WHERE user_id=$1`, userID, p.Name, p.Phone, p.Country, p.OtherCountry, p.City, p.TimeZone)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}
func (s *Store) SaveProfileEmailChange(ctx context.Context, userID, email string, hash []byte, expires time.Time) error {
	_, err := s.pool.Exec(ctx, `INSERT INTO profile_email_change(user_id,email,token_hash,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET email=$2,token_hash=$3,expires_at=$4`, userID, email, hash, expires)
	return err
}
func (s *Store) CompleteProfileEmailChange(ctx context.Context, hash []byte, now time.Time) (string, error) {
	var address string
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		var id string
		if err := tx.QueryRow(ctx, `DELETE FROM profile_email_change WHERE token_hash=$1 AND expires_at>$2 RETURNING user_id,email`, hash, now).Scan(&id, &address); err != nil {
			return notFound(err)
		}
		if _, err := tx.Exec(ctx, `UPDATE app_user SET email=$2,email_verified_at=$3 WHERE id=$1`, id, address, now); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE client SET email=$2 WHERE user_id=$1`, id, address); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM email_token WHERE user_id=$1`, id); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `DELETE FROM auth_session WHERE user_id=$1`, id)
		return err
	})
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
		return "", ErrEmailTaken
	}
	return address, err
}
