// Package store is the only package that talks to Postgres.
package store

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"

	"careconnect/migrations"
)

// Store wraps a connection pool.
type Store struct{ pool *pgxpool.Pool }

// Open connects to Postgres.
func Open(ctx context.Context, url string) (*Store, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping db: %w", err)
	}
	return &Store{pool: pool}, nil
}

// Close releases the pool.
func (s *Store) Close() { s.pool.Close() }

// Migrate applies every migration not yet recorded, in file-name order,
// each in its own transaction.
func (s *Store) Migrate(ctx context.Context) error {
	if _, err := s.pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migration (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	names, err := fs.Glob(migrations.FS, "*.sql")
	if err != nil {
		return err
	}
	sort.Strings(names)
	for _, name := range names {
		if err := s.applyMigration(ctx, name); err != nil {
			return fmt.Errorf("migrate %s: %w", name, err)
		}
	}
	return nil
}

func (s *Store) applyMigration(ctx context.Context, name string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	tag, err := tx.Exec(ctx, `INSERT INTO schema_migration (name) VALUES ($1) ON CONFLICT DO NOTHING`, name)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return nil // already applied
	}
	sql, err := fs.ReadFile(migrations.FS, name)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, string(sql)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ResetForSeed drops every table so the seed script can start clean.
// It refuses to run unless ALLOW_RESET=yes, so it never hits a real database by accident.
func (s *Store) ResetForSeed(ctx context.Context) error {
	if os.Getenv("ALLOW_RESET") != "yes" {
		return errors.New("refusing to reset: set ALLOW_RESET=yes (development databases only)")
	}
	_, err := s.pool.Exec(ctx, `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`)
	return err
}
