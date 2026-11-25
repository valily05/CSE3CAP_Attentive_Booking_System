package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// PsychologistFilter is the "Our Psychologists" filter bar. Empty = any.
type PsychologistFilter struct {
	AgeGroup   string // adult | child_teen | family_couple
	Mode       string // online | in_person
	LocationID string
}

// PsychologistCard is public profile information only (G09-2).
type PsychologistCard struct {
	DirectoryMetadata map[string]any `json:"directoryMetadata,omitempty"`
	ID                string         `json:"id"`
	Name              string         `json:"name"`
	Title             string         `json:"title"`
	Specialty         string         `json:"specialty"`
	Bio               string         `json:"bio"`
	PhotoURL          string         `json:"photoUrl"`
	SessionTypes      []string       `json:"sessionTypes"`
	LocationIDs       []string       `json:"locationIds"`
	ServiceIDs        []string       `json:"serviceIds"`
}

const cardColumns = `
	p.directory_metadata, p.id, p.name, p.title, p.specialty, p.bio, p.photo_url, p.session_types,
	COALESCE((SELECT array_agg(location_id ORDER BY location_id) FROM psychologist_location WHERE psychologist_id = p.id), '{}'),
	COALESCE((SELECT array_agg(service_id ORDER BY service_id) FROM psychologist_service WHERE psychologist_id = p.id), '{}')`

// SearchPsychologists lists active psychologists matching every filter.
func (s *Store) SearchPsychologists(ctx context.Context, f PsychologistFilter) ([]PsychologistCard, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT `+cardColumns+`
		FROM psychologist p
		WHERE p.active
		  AND ($1 = '' OR EXISTS (
		        SELECT 1 FROM psychologist_service ps JOIN service sv ON sv.id = ps.service_id
		        WHERE ps.psychologist_id = p.id AND sv.active AND sv.age_group = $1))
		  AND ($2 = ''
		        OR ($2 = 'in_person' AND 'in_person' = ANY (p.session_types))
		        OR ($2 = 'online' AND p.session_types && ARRAY['chat', 'voice', 'video']))
		  AND ($3 = '' OR EXISTS (
		        SELECT 1 FROM psychologist_location pl
		        WHERE pl.psychologist_id = p.id AND pl.location_id = $3))
		ORDER BY p.name`, f.AgeGroup, f.Mode, f.LocationID)
	if err != nil {
		return nil, fmt.Errorf("search psychologists: %w", err)
	}
	return pgx.CollectRows(rows, scanCard)
}

// GetPsychologist returns one active psychologist's public profile.
func (s *Store) GetPsychologist(ctx context.Context, id string) (PsychologistCard, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+cardColumns+` FROM psychologist p WHERE p.active AND p.id = $1`, id)
	if err != nil {
		return PsychologistCard{}, err
	}
	c, err := pgx.CollectExactlyOneRow(rows, scanCard)
	return c, notFound(err)
}

func scanCard(row pgx.CollectableRow) (PsychologistCard, error) {
	var c PsychologistCard
	err := row.Scan(&c.DirectoryMetadata, &c.ID, &c.Name, &c.Title, &c.Specialty, &c.Bio, &c.PhotoURL, &c.SessionTypes, &c.LocationIDs, &c.ServiceIDs)
	return c, err
}

// SetPsychologistActive shows or hides a psychologist from clients.
func (s *Store) SetPsychologistActive(ctx context.Context, id string, active bool) error {
	tag, err := s.pool.Exec(ctx, `UPDATE psychologist SET active = $2 WHERE id = $1`, id, active)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
