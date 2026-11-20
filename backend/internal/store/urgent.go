package store

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrUrgentCapacity = errors.New("urgent reference capacity reached")
var ErrUrgentCodeConflict = errors.New("urgent code already belongs to another appointment")

type UrgentRequest struct {
	ID             string         `json:"id"`
	BookingCode    string         `json:"bookingCode"`
	CustomerName   string         `json:"customerName"`
	Email          string         `json:"email"`
	WhatsAppNumber string         `json:"whatsappNumber"`
	SessionType    string         `json:"sessionType"`
	LocationID     string         `json:"locationId"`
	LocationName   string         `json:"locationName"`
	Status         string         `json:"status"`
	AcknowledgedAt time.Time      `json:"acknowledgedAt"`
	CreatedAt      time.Time      `json:"createdAt"`
	UpdatedAt      time.Time      `json:"updatedAt"`
	Workflow       UrgentWorkflow `json:"workflow"`
}

// LimitUrgent counts attempts atomically across API processes. Keys contain hashes only.
func (s *Store) LimitUrgent(ctx context.Context, key []byte, now time.Time, limit int) (bool, error) {
	var attempts int
	err := s.pool.QueryRow(ctx, `INSERT INTO urgent_request_limit(key_hash,bucket,attempts)
 VALUES ($1,$2,1) ON CONFLICT(key_hash,bucket) DO UPDATE
 SET attempts=urgent_request_limit.attempts+1 RETURNING attempts`,
		key, now.UTC().Truncate(time.Hour)).Scan(&attempts)
	return attempts <= limit, err
}

func (s *Store) CreateUrgent(ctx context.Context, in UrgentRequest, hash []byte, now time.Time) (UrgentRequest, error) {
	existing, existingErr := s.UrgentReceipt(ctx, hash)
	if existingErr == nil {
		if existing.CustomerName != in.CustomerName || existing.Email != in.Email || existing.SessionType != in.SessionType || existing.LocationID != in.LocationID || existing.WhatsAppNumber != in.WhatsAppNumber {
			return in, ErrInvalidSetting
		}
		return existing, nil
	}
	if !errors.Is(existingErr, ErrNotFound) {
		return in, existingErr
	}
	var used int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM (SELECT booking_code FROM urgent_request UNION SELECT code FROM booking WHERE code ~ '^ATT[0-9]{4}$') occupied`).Scan(&used); err != nil {
		return in, err
	}
	if used >= 10000 {
		return in, ErrUrgentCapacity
	}
	var submitted bool
	if err := s.pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM urgent_request WHERE submission_key_hash=$1)", hash).Scan(&submitted); err != nil {
		return in, err
	}
	if submitted {
		return in, ErrNotChangeable
	}
	codes := make([]int, 10000)
	for i := range codes {
		codes[i] = i
	}
	// Random sampling without replacement inspects every code at most once.
	// The UNIQUE constraint serializes competing inserts without overwriting records.
	for offset := 0; offset < 10000; offset++ {
		index, err := rand.Int(rand.Reader, big.NewInt(int64(len(codes))))
		if err != nil {
			return in, err
		}
		selected := int(index.Int64())
		code := fmt.Sprintf("ATT%04d", codes[selected])
		codes[selected] = codes[len(codes)-1]
		codes = codes[:len(codes)-1]
		err = s.pool.QueryRow(ctx, `INSERT INTO urgent_request
  (booking_code,customer_name,email,whatsapp_number,session_type,location_id,owner_access_hash,submission_key_hash,access_expires_at,acknowledged_at,created_at,updated_at)
  SELECT $1,$2,$3,NULLIF($4,''),$5,NULLIF($6,''),$7,$7,CURRENT_TIMESTAMP+interval '30 days',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
  WHERE ($5='online' OR EXISTS(SELECT 1 FROM location WHERE id=$6 AND active))
  AND NOT EXISTS(SELECT 1 FROM booking WHERE code=$1)
  ON CONFLICT DO NOTHING RETURNING id,booking_code,status,acknowledged_at,created_at,updated_at`,
			code, in.CustomerName, in.Email, in.WhatsAppNumber, in.SessionType, in.LocationID, hash).
			Scan(&in.ID, &in.BookingCode, &in.Status, &in.AcknowledgedAt, &in.CreatedAt, &in.UpdatedAt)
		if err == nil {
			return s.UrgentReceipt(ctx, hash)
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return in, err
		}
		if existing, err := s.UrgentReceipt(ctx, hash); err == nil {
			return existing, nil
		}
		if in.SessionType == "onsite" {
			var active bool
			if err := s.pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM location WHERE id=$1 AND active)", in.LocationID).Scan(&active); err != nil {
				return in, err
			}
			if !active {
				return in, ErrNotFound
			}
		}
	}
	return in, ErrUrgentCapacity
}

const urgentColumns = `u.id,u.booking_code,u.customer_name,u.email,COALESCE(u.whatsapp_number,''),u.session_type,
 COALESCE(u.location_id,''),COALESCE(l.name,''),u.status,u.acknowledged_at,u.created_at,u.updated_at,
 jsonb_build_object(
 'submittedAt',u.submitted_at,'clientId',u.client_id,'appointmentId',u.appointment_id,
 'clientName',(SELECT name FROM client WHERE id=u.client_id),'clientEmail',(SELECT email FROM client WHERE id=u.client_id),
 'psychologistId',u.assigned_psychologist_id,'serviceId',u.assigned_service_id,'channel',u.assigned_channel,'start',u.proposed_start,
 'assignedAt',u.assigned_at,'confirmedAt',u.confirmed_at,'checkedInAt',u.checked_in_at,'completedAt',u.completed_at,'cancelledAt',u.cancelled_at,
 'linkedAt',u.linked_at,'arrivalStatus',u.arrival_status,'estimatedDepartureAt',u.estimated_departure_at,'arrivalUpdatedAt',u.arrival_updated_at,
 'readiness',u.readiness,'address',COALESCE(l.address,''),'mapsUrl',COALESCE(l.maps_url,''),'isUrgent',true,
 'waitingMinutes',GREATEST(0,floor(extract(epoch from CURRENT_TIMESTAMP-u.submitted_at)/60)))`

func (s *Store) UrgentRequests(ctx context.Context, code string, hash []byte) ([]UrgentRequest, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+urgentColumns+` FROM urgent_request u LEFT JOIN location l ON l.id=u.location_id
 WHERE ($1='' OR u.booking_code=$1) AND ($2::bytea IS NULL OR
 (u.owner_access_hash=$2 AND u.access_expires_at>CURRENT_TIMESTAMP) OR
 EXISTS(SELECT 1 FROM urgent_access a WHERE a.request_id=u.id AND a.token_hash=$2 AND a.purpose='owner' AND a.expires_at>CURRENT_TIMESTAMP))
 ORDER BY u.submitted_at DESC`, code, hash)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[UrgentRequest])
}

func (s *Store) UrgentReceipt(ctx context.Context, hash []byte) (UrgentRequest, error) {
	var code string
	err := s.pool.QueryRow(ctx, `SELECT booking_code FROM urgent_request WHERE owner_access_hash=$1 AND access_expires_at>CURRENT_TIMESTAMP
 UNION ALL SELECT u.booking_code FROM urgent_access a JOIN urgent_request u ON u.id=a.request_id
 WHERE a.token_hash=$1 AND a.purpose='owner' AND a.expires_at>CURRENT_TIMESTAMP LIMIT 1`, hash).Scan(&code)
	if err != nil {
		return UrgentRequest{}, notFound(err)
	}
	return s.UrgentByCode(ctx, code)
}

func (s *Store) UpdateUrgent(ctx context.Context, id, status, previous, actor string, now time.Time) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	tag, err := tx.Exec(ctx, `UPDATE urgent_request SET status=$2,updated_at=$3 WHERE id::text=$1 AND status=$4`, id, status, now, previous)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotChangeable
	}
	_, err = tx.Exec(ctx, `INSERT INTO urgent_request_status_history(request_id,actor_id,old_status,new_status,changed_at)
 VALUES ($1,$2,$3,$4,$5)`, id, actor, previous, status, now)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
