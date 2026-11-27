package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"careconnect/internal/domain/auth"
)

// ErrEmailTaken means an account with that email already exists.
var ErrEmailTaken = errors.New("an account with this email already exists")

// NewUser is a login account.
type NewUser struct {
	Email, PasswordHash string
	Role                string // client | psychologist | admin
	Verified            bool   // admin-created accounts start verified
}

// User is a login account with its linked client or psychologist profile.
type User struct {
	ID             string
	Email          string
	PasswordHash   string
	Role           string
	EmailVerified  bool
	Attempts       auth.Attempts
	ClientID       string
	PsychologistID string
}

// CreateUser stores an account.
func (s *Store) CreateUser(ctx context.Context, u NewUser) (string, error) {
	var id string
	err := s.pool.QueryRow(ctx, `
		INSERT INTO app_user (email, password_hash, role, email_verified_at)
		VALUES ($1, $2, $3, CASE WHEN $4 THEN now() END) RETURNING id`,
		u.Email, u.PasswordHash, u.Role, u.Verified).Scan(&id)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
		return "", ErrEmailTaken
	}
	if err != nil {
		return "", fmt.Errorf("create user: %w", err)
	}
	return id, nil
}

const userSQL = `
	SELECT u.id, u.email, u.password_hash, u.role, u.email_verified_at IS NOT NULL,
	       u.failed_logins, u.locked_until, COALESCE(c.id::text, ''), COALESCE(p.id::text, '')
	FROM app_user u
	LEFT JOIN client c       ON c.user_id = u.id
	LEFT JOIN psychologist p ON p.user_id = u.id`

func (s *Store) oneUser(ctx context.Context, where string, args ...any) (User, error) {
	var u User
	var locked *time.Time
	err := s.pool.QueryRow(ctx, userSQL+" WHERE "+where, args...).Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.Role, &u.EmailVerified,
		&u.Attempts.Failures, &locked, &u.ClientID, &u.PsychologistID)
	if locked != nil {
		u.Attempts.LockedUntil = *locked
	}
	return u, notFound(err)
}

// UserByEmail finds an account, ignoring email case.
func (s *Store) UserByEmail(ctx context.Context, email string) (User, error) {
	return s.oneUser(ctx, "lower(u.email) = lower($1)", email)
}

// UserByID finds an account.
func (s *Store) UserByID(ctx context.Context, id string) (User, error) {
	return s.oneUser(ctx, "u.id = $1", id)
}

// SaveAttempts stores the failed-login counter.
func (s *Store) SaveAttempts(ctx context.Context, userID string, a auth.Attempts) error {
	var locked *time.Time
	if !a.LockedUntil.IsZero() {
		locked = &a.LockedUntil
	}
	_, err := s.pool.Exec(ctx, `UPDATE app_user SET failed_logins = $2, locked_until = $3 WHERE id = $1`, userID, a.Failures, locked)
	return err
}

// SetPassword replaces a password hash and ends every session.
func (s *Store) SetPassword(ctx context.Context, userID, hash string) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE app_user SET password_hash = $2, failed_logins = 0, locked_until = NULL WHERE id = $1`, userID, hash); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM profile_email_change WHERE user_id=$1`, userID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `DELETE FROM auth_session WHERE user_id = $1`, userID)
		return err
	})
}

// MarkEmailVerified records that the user confirmed their address.
func (s *Store) MarkEmailVerified(ctx context.Context, userID string) error {
	_, err := s.pool.Exec(ctx, `UPDATE app_user SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1`, userID)
	return err
}

// CreateSession stores a login session by token hash (the raw token only
// ever lives in the user's cookie).
func (s *Store) CreateSession(ctx context.Context, tokenHash []byte, userID string, expires time.Time) error {
	_, err := s.pool.Exec(ctx, `INSERT INTO auth_session (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, tokenHash, userID, expires)
	return err
}

// SessionUser returns the user for a live session.
func (s *Store) SessionUser(ctx context.Context, tokenHash []byte, now time.Time) (User, error) {
	return s.oneUser(ctx, "u.id = (SELECT user_id FROM auth_session WHERE token_hash = $1 AND expires_at > $2)", tokenHash, now)
}

// DeleteSession logs out.
func (s *Store) DeleteSession(ctx context.Context, tokenHash []byte) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM auth_session WHERE token_hash = $1`, tokenHash)
	return err
}

// CreateEmailToken stores a single-use email link token by hash.
func (s *Store) CreateEmailToken(ctx context.Context, tokenHash []byte, userID, purpose string, expires time.Time) error {
	_, err := s.pool.Exec(ctx, `INSERT INTO email_token (token_hash, user_id, purpose, expires_at) VALUES ($1, $2, $3, $4)`,
		tokenHash, userID, purpose, expires)
	return err
}

// UseEmailToken consumes a token and returns its user. It works once.
func (s *Store) UseEmailToken(ctx context.Context, tokenHash []byte, purpose string, now time.Time) (string, error) {
	var userID string
	err := s.pool.QueryRow(ctx, `
		UPDATE email_token SET used_at = $3
		WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > $3
		RETURNING user_id`, tokenHash, purpose, now).Scan(&userID)
	return userID, notFound(err)
}
