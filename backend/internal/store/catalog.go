package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// Location is an admin-editable place, e.g. {bsd, "BSD (Tangerang)"}.
type Location struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Active bool   `json:"active"`
}

// Service is an admin-editable session type with a fixed length.
type Service struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	LengthMinutes int    `json:"lengthMinutes"`
	AgeGroup      string `json:"ageGroup"` // adult | child_teen | family_couple
	Active        bool   `json:"active"`
}

// UpsertLocation creates or updates a location. New locations are active.
func (s *Store) UpsertLocation(ctx context.Context, l Location) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO location (id, name) VALUES ($1, $2)
		ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`, l.ID, l.Name)
	if err != nil {
		return fmt.Errorf("upsert location: %w", err)
	}
	return nil
}

// UpsertService creates or updates a service. New services are active.
func (s *Store) UpsertService(ctx context.Context, sv Service) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO service (id, name, length_minutes, age_group) VALUES ($1, $2, $3, $4)
		ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, length_minutes = EXCLUDED.length_minutes, age_group = EXCLUDED.age_group`,
		sv.ID, sv.Name, sv.LengthMinutes, sv.AgeGroup)
	if err != nil {
		return fmt.Errorf("upsert service: %w", err)
	}
	return nil
}

// NewPsychologist is a psychologist profile created by an admin.
type NewPsychologist struct {
	UserID                      string // optional login account
	Name, Title, Specialty, Bio string
	PhotoURL                    string
	SessionTypes                []string // chat, voice, video, in_person
	LocationIDs, ServiceIDs     []string
}

// CreatePsychologist stores a profile with its locations and services.
func (s *Store) CreatePsychologist(ctx context.Context, p NewPsychologist) (string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var id string
	err = tx.QueryRow(ctx, `
		INSERT INTO psychologist (user_id, name, title, specialty, bio, photo_url, session_types)
		VALUES (NULLIF($1, '')::uuid, $2, $3, $4, $5, $6, $7) RETURNING id`,
		p.UserID, p.Name, p.Title, p.Specialty, p.Bio, p.PhotoURL, p.SessionTypes).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("create psychologist: %w", err)
	}
	for _, l := range p.LocationIDs {
		if _, err := tx.Exec(ctx, `INSERT INTO psychologist_location VALUES ($1, $2)`, id, l); err != nil {
			return "", fmt.Errorf("psychologist location %s: %w", l, err)
		}
	}
	for _, sv := range p.ServiceIDs {
		if _, err := tx.Exec(ctx, `INSERT INTO psychologist_service VALUES ($1, $2)`, id, sv); err != nil {
			return "", fmt.Errorf("psychologist service %s: %w", sv, err)
		}
	}
	return id, tx.Commit(ctx)
}

// NewClient is a client record. UserID is empty for clients an admin books
// on their behalf (e.g. someone who still uses WhatsApp).
type NewClient struct {
	UserID           string
	Name, Email      string
	Phone            string
	AgreedToMessages bool
	Locale           string // id | en; empty means id
}

// CreateClient stores a client.
func (s *Store) CreateClient(ctx context.Context, c NewClient) (string, error) {
	var id string
	err := s.pool.QueryRow(ctx, `
		INSERT INTO client (user_id, name, email, phone, agreed_to_messages, locale)
		VALUES (NULLIF($1, '')::uuid, $2, $3, $4, $5, COALESCE(NULLIF($6, ''), 'id')) RETURNING id`,
		c.UserID, c.Name, c.Email, c.Phone, c.AgreedToMessages, c.Locale).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("create client: %w", err)
	}
	return id, nil
}

// LinkPsychologistUser connects a login account to a psychologist profile.
func (s *Store) LinkPsychologistUser(ctx context.Context, psychID, userID string) error {
	tag, err := s.pool.Exec(ctx, `UPDATE psychologist SET user_id = $2 WHERE id = $1`, psychID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ClientContact is what an email to a client needs.
type ClientContact struct {
	ID, Name, Email, Locale string
}

// ClientContact loads a client's name, email and language.
func (s *Store) ClientContact(ctx context.Context, id string) (ClientContact, error) {
	c := ClientContact{ID: id}
	err := s.pool.QueryRow(ctx, `SELECT name, email, locale FROM client WHERE id = $1`, id).Scan(&c.Name, &c.Email, &c.Locale)
	return c, notFound(err)
}

// Catalog is the admin-editable lists clients filter by.
type Catalog struct {
	Locations []Location `json:"locations"`
	Services  []Service  `json:"services"`
}

// Catalog returns active locations and services.
func (s *Store) Catalog(ctx context.Context) (Catalog, error) {
	var c Catalog
	rows, err := s.pool.Query(ctx, `SELECT id, name, active FROM location WHERE active ORDER BY name`)
	if err != nil {
		return c, err
	}
	if c.Locations, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Location]); err != nil {
		return c, err
	}
	rows, err = s.pool.Query(ctx, `SELECT id, name, length_minutes, age_group, active FROM service WHERE active ORDER BY length_minutes, name`)
	if err != nil {
		return c, err
	}
	c.Services, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Service])
	return c, err
}

// GetService returns one active service.
func (s *Store) GetService(ctx context.Context, id string) (Service, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, name, length_minutes, age_group, active FROM service WHERE id = $1 AND active`, id)
	if err != nil {
		return Service{}, err
	}
	sv, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByPos[Service])
	return sv, notFound(err)
}
