package store

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"time"
)

var ErrWaitingDuplicate = errors.New("identical active waiting request")

type WaitingRequest struct {
	ID               string    `json:"id"`
	ClientID         string    `json:"-"`
	PsychologistID   string    `json:"psychologistId"`
	PsychologistName string    `json:"psychologistName"`
	ServiceID        string    `json:"serviceId"`
	ServiceName      string    `json:"serviceName"`
	Date             string    `json:"date"`
	DateEnd          string    `json:"dateEnd"`
	Periods          []string  `json:"periods"`
	SessionType      string    `json:"sessionType"`
	LocationID       string    `json:"locationId"`
	LocationName     string    `json:"locationName"`
	Status           string    `json:"status"`
	Key              string    `json:"-"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

func (s *Store) CreateWaiting(ctx context.Context, r WaitingRequest) (WaitingRequest, error) {
	err := s.pool.QueryRow(ctx, `INSERT INTO session_waiting_list(client_id,psychologist_id,service_id,preferred_date,preferred_date_end,periods,session_type,location_id,preferences_key,created_at,updated_at) VALUES($1,NULLIF($2,'')::uuid,$3,$4::text::date,$5::text::date,$6,$7,NULLIF($8,''),$9,$10,$10) RETURNING id,status`, r.ClientID, r.PsychologistID, r.ServiceID, r.Date, r.DateEnd, r.Periods, r.SessionType, r.LocationID, r.Key, r.CreatedAt).Scan(&r.ID, &r.Status)
	var pgerr *pgconn.PgError
	if errors.As(err, &pgerr) && pgerr.Code == "23505" {
		return r, ErrWaitingDuplicate
	}
	return r, err
}
func (s *Store) WaitingRequests(ctx context.Context, client string, active bool) ([]WaitingRequest, error) {
	rows, err := s.pool.Query(ctx, `SELECT w.id,w.client_id,COALESCE(w.psychologist_id::text,''),COALESCE(p.name,''),w.service_id,sv.name,w.preferred_date::text,w.preferred_date_end::text,w.periods,w.session_type,COALESCE(w.location_id,''),COALESCE(l.name,''),w.status,w.created_at,w.updated_at FROM session_waiting_list w LEFT JOIN psychologist p ON p.id=w.psychologist_id JOIN service sv ON sv.id=w.service_id LEFT JOIN location l ON l.id=w.location_id WHERE ($1='' OR w.client_id::text=$1) AND (NOT $2 OR w.status='active') ORDER BY w.created_at DESC`, client, active)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []WaitingRequest{}
	for rows.Next() {
		var r WaitingRequest
		if err = rows.Scan(&r.ID, &r.ClientID, &r.PsychologistID, &r.PsychologistName, &r.ServiceID, &r.ServiceName, &r.Date, &r.DateEnd, &r.Periods, &r.SessionType, &r.LocationID, &r.LocationName, &r.Status, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
func (s *Store) RemoveWaiting(ctx context.Context, client, id string, now time.Time) error {
	tag, err := s.pool.Exec(ctx, `UPDATE session_waiting_list SET status='removed',updated_at=$3 WHERE id::text=$1 AND client_id::text=$2 AND status='active'`, id, client, now)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

type WaitingSlot struct {
	PsychologistID   string    `json:"psychologistId"`
	PsychologistName string    `json:"psychologistName"`
	Start            time.Time `json:"start"`
	SessionType      string    `json:"sessionType"`
	LocationID       string    `json:"locationId"`
	LocationName     string    `json:"locationName"`
	ServiceID        string    `json:"serviceId"`
	Link             string    `json:"link"`
}

func (s *Store) WithWaitingLock(ctx context.Context, fn func() error) error {
	conn, err := s.pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	var ok bool
	if err = conn.QueryRow(ctx, `SELECT pg_try_advisory_lock(824719623)`).Scan(&ok); err != nil || !ok {
		return err
	}
	defer conn.Exec(context.Background(), `SELECT pg_advisory_unlock(824719623)`)
	return fn()
}

// Persist the availability transition and both delivery channels atomically.
func (s *Store) WaitingSnapshot(ctx context.Context, r WaitingRequest, slots map[string]WaitingSlot, now time.Time) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		var status string
		if err := tx.QueryRow(ctx, `SELECT status FROM session_waiting_list WHERE id=$1 FOR UPDATE`, r.ID).Scan(&status); err != nil {
			return err
		}
		if status != "active" {
			return nil
		}
		rows, err := tx.Query(ctx, `SELECT slot_key,available FROM waiting_slot_state WHERE request_id=$1`, r.ID)
		if err != nil {
			return err
		}
		old := map[string]bool{}
		for rows.Next() {
			var key string
			var open bool
			if err = rows.Scan(&key, &open); err != nil {
				rows.Close()
				return err
			}
			old[key] = open
		}
		rows.Close()
		if err = rows.Err(); err != nil {
			return err
		}
		for key, details := range slots {
			if old[key] {
				continue
			}
			var gen int
			err = tx.QueryRow(ctx, `INSERT INTO waiting_slot_state(request_id,slot_key,available) VALUES($1,$2,true) ON CONFLICT(request_id,slot_key) DO UPDATE SET available=true,generation=waiting_slot_state.generation+1 RETURNING generation`, r.ID, key).Scan(&gen)
			if err != nil {
				return err
			}
			raw, _ := json.Marshal(details)
			var delivery string
			err = tx.QueryRow(ctx, `INSERT INTO waiting_delivery(request_id,slot_key,generation,details,created_at) VALUES($1,$2,$3,$4,$5) RETURNING id`, r.ID, key, gen, raw, now).Scan(&delivery)
			if err != nil {
				return err
			}
			_, err = tx.Exec(ctx, `INSERT INTO account_notification(user_id,kind,created_at,details,delivery_id) SELECT user_id,'waiting_slot',$2,$3,$4 FROM client WHERE id=$1 AND user_id IS NOT NULL`, r.ClientID, now, raw, delivery)
			if err != nil {
				return err
			}
		}
		for key, open := range old {
			if _, present := slots[key]; open && !present {
				if _, err = tx.Exec(ctx, `UPDATE waiting_slot_state SET available=false WHERE request_id=$1 AND slot_key=$2`, r.ID, key); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

type WaitingDelivery struct {
	ID      string
	Email   string
	Locale  string
	Details WaitingSlot
}

func (s *Store) WaitingDeliveries(ctx context.Context, notBefore time.Time) ([]WaitingDelivery, error) {
	rows, err := s.pool.Query(ctx, `SELECT d.id,c.email,c.locale,d.details FROM waiting_delivery d JOIN session_waiting_list w ON w.id=d.request_id JOIN client c ON c.id=w.client_id JOIN waiting_slot_state st ON st.request_id=d.request_id AND st.slot_key=d.slot_key AND st.generation=d.generation WHERE d.sent_at IS NULL AND w.status='active' AND st.available AND (d.details->>'start')::timestamptz>=$1 ORDER BY d.created_at LIMIT 100`, notBefore)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []WaitingDelivery{}
	for rows.Next() {
		var d WaitingDelivery
		var raw []byte
		if err = rows.Scan(&d.ID, &d.Email, &d.Locale, &raw); err != nil {
			return nil, err
		}
		if err = json.Unmarshal(raw, &d.Details); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}
func (s *Store) WaitingDeliverySent(ctx context.Context, id string, now time.Time) error {
	_, err := s.pool.Exec(ctx, `UPDATE waiting_delivery SET sent_at=$2 WHERE id=$1`, id, now)
	return err
}
func (s *Store) FulfillWaiting(ctx context.Context, client, id string, now time.Time) error {
	tag, err := s.pool.Exec(ctx, `UPDATE session_waiting_list w SET status='fulfilled',updated_at=$3 WHERE w.id::text=$1 AND w.client_id::text=$2 AND w.status='active' AND EXISTS(SELECT 1 FROM booking b WHERE b.client_id=w.client_id AND b.status='confirmed' AND b.service_id=w.service_id AND (w.psychologist_id IS NULL OR b.psychologist_id=w.psychologist_id) AND (b.start_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN w.preferred_date AND w.preferred_date_end AND ((w.session_type='in_person' AND b.mode='in_person' AND b.location_id=w.location_id) OR (b.mode='online' AND b.online_channel=w.session_type)) AND (CASE WHEN EXTRACT(HOUR FROM b.start_at AT TIME ZONE 'Asia/Jakarta')<12 THEN 'morning' WHEN EXTRACT(HOUR FROM b.start_at AT TIME ZONE 'Asia/Jakarta')<17 THEN 'afternoon' ELSE 'evening' END)=ANY(w.periods))`, id, client, now)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
