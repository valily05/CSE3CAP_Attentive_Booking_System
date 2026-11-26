package store

import (
	"context"
	"time"
)

type BookingReschedule struct {
	From time.Time `json:"from"`
	To   time.Time `json:"to"`
	At   time.Time `json:"at"`
}
type BookingMetadata struct {
	LastRescheduled       *BookingReschedule `json:"lastRescheduled,omitempty"`
	PsychologistPhoto     string             `json:"psychologistPhoto"`
	PsychologistSpecialty string             `json:"psychologistSpecialty"`
	BookingMethod         string             `json:"bookingMethod"`
	BookedByName          string             `json:"bookedByName"`
	CreatedAt             time.Time          `json:"createdAt"`
	UpdatedAt             time.Time          `json:"updatedAt"`
}

// IDs come exclusively from the already-authorized client booking list.
func (s *Store) ClientBookingMetadata(ctx context.Context, ids []string) (map[string]BookingMetadata, error) {
	out := map[string]BookingMetadata{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := s.pool.Query(ctx, `SELECT b.id,p.photo_url,p.specialty,CASE creator.role WHEN 'client' THEN 'self_service' WHEN 'admin' THEN 'admin_assisted' ELSE '' END,COALESCE(cc.name,cp.name,''),b.created_at,b.updated_at,a.detail->>'from',a.detail->>'to',a.at FROM booking b JOIN psychologist p ON p.id=b.psychologist_id LEFT JOIN app_user creator ON creator.id=b.created_by LEFT JOIN client cc ON cc.user_id=creator.id LEFT JOIN psychologist cp ON cp.user_id=creator.id LEFT JOIN LATERAL (SELECT detail,at FROM audit_log WHERE booking_id=b.id AND action='reschedule' ORDER BY at DESC,id DESC LIMIT 1) a ON true WHERE b.id=ANY($1::uuid[])`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var m BookingMetadata
		var from, to *string
		var at *time.Time
		if err = rows.Scan(&id, &m.PsychologistPhoto, &m.PsychologistSpecialty, &m.BookingMethod, &m.BookedByName, &m.CreatedAt, &m.UpdatedAt, &from, &to, &at); err != nil {
			return nil, err
		}
		if from != nil && to != nil && at != nil {
			f, fe := time.Parse(time.RFC3339Nano, *from)
			t, te := time.Parse(time.RFC3339Nano, *to)
			if fe == nil && te == nil {
				m.LastRescheduled = &BookingReschedule{From: f, To: t, At: *at}
			}
		}
		out[id] = m
	}
	return out, rows.Err()
}
