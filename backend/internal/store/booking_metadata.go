package store

import (
	"context"
	"time"
)

type BookingMetadata struct {
	PsychologistPhoto     string    `json:"psychologistPhoto"`
	PsychologistSpecialty string    `json:"psychologistSpecialty"`
	BookingMethod         string    `json:"bookingMethod"`
	BookedByName          string    `json:"bookedByName"`
	CreatedAt             time.Time `json:"createdAt"`
	UpdatedAt             time.Time `json:"updatedAt"`
}

// IDs come exclusively from the already-authorized client booking list.
func (s *Store) ClientBookingMetadata(ctx context.Context, ids []string) (map[string]BookingMetadata, error) {
	out := map[string]BookingMetadata{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := s.pool.Query(ctx, `SELECT b.id,p.photo_url,p.specialty,CASE creator.role WHEN 'client' THEN 'self_service' WHEN 'admin' THEN 'admin_assisted' ELSE '' END,COALESCE(cc.name,cp.name,''),b.created_at,b.updated_at FROM booking b JOIN psychologist p ON p.id=b.psychologist_id LEFT JOIN app_user creator ON creator.id=b.created_by LEFT JOIN client cc ON cc.user_id=creator.id LEFT JOIN psychologist cp ON cp.user_id=creator.id WHERE b.id=ANY($1::uuid[])`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var m BookingMetadata
		if err = rows.Scan(&id, &m.PsychologistPhoto, &m.PsychologistSpecialty, &m.BookingMethod, &m.BookedByName, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		out[id] = m
	}
	return out, rows.Err()
}
