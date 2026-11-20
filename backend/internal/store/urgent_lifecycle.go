package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
)

type UrgentWorkflow struct {
	SubmittedAt          time.Time  `json:"submittedAt"`
	WaitingMinutes       int        `json:"waitingMinutes"`
	ClientID             string     `json:"clientId"`
	ClientName           string     `json:"clientName"`
	ClientEmail          string     `json:"clientEmail"`
	AppointmentID        string     `json:"appointmentId"`
	PsychologistID       string     `json:"psychologistId"`
	ServiceID            string     `json:"serviceId"`
	Channel              string     `json:"channel"`
	Start                *time.Time `json:"start"`
	AssignedAt           *time.Time `json:"assignedAt"`
	ConfirmedAt          *time.Time `json:"confirmedAt"`
	CheckedInAt          *time.Time `json:"checkedInAt"`
	CompletedAt          *time.Time `json:"completedAt"`
	CancelledAt          *time.Time `json:"cancelledAt"`
	LinkedAt             *time.Time `json:"linkedAt"`
	ArrivalStatus        string     `json:"arrivalStatus"`
	EstimatedDepartureAt *time.Time `json:"estimatedDepartureAt"`
	ArrivalUpdatedAt     *time.Time `json:"arrivalUpdatedAt"`
	Readiness            string     `json:"readiness"`
	Address              string     `json:"address"`
	MapsURL              string     `json:"mapsUrl"`
	IsUrgent             bool       `json:"isUrgent"`
}

func (s *Store) UrgentByCode(ctx context.Context, code string) (UrgentRequest, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+urgentColumns+` FROM urgent_request u LEFT JOIN location l ON l.id=u.location_id WHERE u.booking_code=$1`, code)
	if err != nil {
		return UrgentRequest{}, err
	}
	result, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByPos[UrgentRequest])
	return result, notFound(err)
}

func (s *Store) UrgentEvent(ctx context.Context, code, action, value, actor string) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		var lockedAppointment string
		if err := tx.QueryRow(ctx, "SELECT COALESCE(appointment_id::text,'') FROM urgent_request WHERE booking_code=$1", code).Scan(&lockedAppointment); err != nil {
			return notFound(err)
		}
		if lockedAppointment != "" {
			if _, err := tx.Exec(ctx, "SELECT id FROM booking WHERE id=$1 FOR UPDATE", lockedAppointment); err != nil {
				return err
			}
		}
		var id, status string
		if err := tx.QueryRow(ctx, "SELECT id,status FROM urgent_request WHERE booking_code=$1 FOR UPDATE", code).Scan(&id, &status); err != nil {
			return notFound(err)
		}
		if (status == "COMPLETED" || status == "CANCELLED") && action != "link" {
			return ErrNotChangeable
		}
		switch action {
		case "check-in":
			var checked bool
			if err := tx.QueryRow(ctx, "SELECT checked_in_at IS NOT NULL FROM urgent_request WHERE id=$1", id).Scan(&checked); err != nil {
				return err
			}
			if checked {
				return nil
			}
			_, err := tx.Exec(ctx, `UPDATE urgent_request SET checked_in_at=COALESCE(checked_in_at,CURRENT_TIMESTAMP),
   checked_in_by_admin_id=COALESCE(checked_in_by_admin_id,$2::uuid),
   status=CASE WHEN status IN ('PENDING','CONTACTED') THEN 'CHECKED_IN' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE id=$1`, id, actor)
			if err != nil {
				return err
			}
		case "readiness":
			if value != "awaiting" && value != "ready" && value != "unavailable" {
				return ErrInvalidSetting
			}
			if _, err := tx.Exec(ctx, "UPDATE urgent_request SET readiness=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1", id, value); err != nil {
				return err
			}
		case "cancel":
			var appointment string
			if err := tx.QueryRow(ctx, "SELECT COALESCE(appointment_id::text,'') FROM urgent_request WHERE id=$1", id).Scan(&appointment); err != nil {
				return err
			}
			if appointment != "" {
				return ErrNotChangeable
			}
			if _, err := tx.Exec(ctx, "UPDATE urgent_request SET status='CANCELLED',cancelled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1", id); err != nil {
				return err
			}
		case "link":
			var current, appointment string
			if err := tx.QueryRow(ctx, "SELECT COALESCE(client_id::text,''),COALESCE(appointment_id::text,'') FROM urgent_request WHERE id=$1", id).Scan(&current, &appointment); err != nil {
				return err
			}
			if current == value {
				return nil
			}
			if appointment != lockedAppointment {
				return ErrNotChangeable
			}
			if appointment != "" {
				if _, err := tx.Exec(ctx, "UPDATE booking SET client_id=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1", appointment, value); err != nil {
					return err
				}
			}
			if _, err := tx.Exec(ctx, `UPDATE urgent_request SET client_id=$2,linked_at=CURRENT_TIMESTAMP,linked_by_admin_id=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1`, id, value, actor); err != nil {
				return err
			}
			return audit(ctx, tx, actor, "urgent:link", "", map[string]any{"urgentCode": code, "fromClientId": current, "clientId": value})
		default:
			return ErrInvalidSetting
		}
		return audit(ctx, tx, actor, "urgent:"+action, "", map[string]any{"urgentCode": code, "value": value})
	})
}

func (s *Store) UrgentGuest(ctx context.Context, code, actor string) (string, error) {
	var clientID string
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		var id, name, email, phone, status string
		err := tx.QueryRow(ctx, `SELECT id,customer_name,email,COALESCE(whatsapp_number,''),COALESCE(client_id::text,''),status
  FROM urgent_request WHERE booking_code=$1 FOR UPDATE`, code).Scan(&id, &name, &email, &phone, &clientID, &status)
		if err != nil {
			return notFound(err)
		}
		if clientID != "" {
			return nil
		}
		if status == "CANCELLED" || status == "COMPLETED" {
			return ErrNotChangeable
		}
		// Serialize staff creation by email and require explicit linking for existing matches.
		if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended(lower($1),0))", email); err != nil {
			return err
		}
		if phone != "" {
			if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1,1))", phone); err != nil {
				return err
			}
		}
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM client WHERE lower(email)=lower($1) OR
   ($2<>'' AND regexp_replace(regexp_replace(phone,'\D','','g'),'^0','62')=regexp_replace($2,'\D','','g')))`, email, phone).Scan(&exists); err != nil {
			return err
		}
		if exists {
			return ErrEmailTaken
		}
		if err := tx.QueryRow(ctx, "INSERT INTO client(name,email,phone) VALUES($1,$2,$3) RETURNING id", name, email, phone).Scan(&clientID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE urgent_request SET client_id=$2,linked_at=CURRENT_TIMESTAMP,linked_by_admin_id=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1`, id, clientID, actor); err != nil {
			return err
		}
		return audit(ctx, tx, actor, "urgent:create-guest", "", map[string]any{"urgentCode": code, "clientId": clientID})
	})
	return clientID, err
}

func (s *Store) AssignUrgent(ctx context.Context, code, psych, service, channel string, start time.Time, actor string) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		var id, status string
		if err := tx.QueryRow(ctx, "SELECT id,status FROM urgent_request WHERE booking_code=$1 FOR UPDATE", code).Scan(&id, &status); err != nil {
			return notFound(err)
		}
		if status == "COMPLETED" || status == "CANCELLED" {
			return ErrNotChangeable
		}
		var reserved bool
		if err := tx.QueryRow(ctx, "SELECT appointment_id IS NOT NULL FROM urgent_request WHERE id=$1", id).Scan(&reserved); err != nil {
			return err
		}
		if reserved {
			return ErrNotChangeable
		}
		if _, err := tx.Exec(ctx, `UPDATE urgent_request SET assigned_psychologist_id=$2,assigned_service_id=$3,assigned_channel=NULLIF($4,''),
  proposed_start=$5,assigned_at=CURRENT_TIMESTAMP,assigned_by_admin_id=$6,status='ASSIGNED',readiness='awaiting',updated_at=CURRENT_TIMESTAMP WHERE id=$1`, id, psych, service, channel, start, actor); err != nil {
			return err
		}
		return audit(ctx, tx, actor, "urgent:assigned", "", map[string]any{"urgentCode": code, "psychologistId": psych, "start": start})
	})
}

func (s *Store) UrgentArrival(ctx context.Context, hash []byte, choice string) error {
	request, err := s.UrgentReceipt(ctx, hash)
	if err != nil {
		return err
	}
	if request.SessionType != "onsite" || request.Status == "CANCELLED" || request.Status == "COMPLETED" {
		return ErrNotChangeable
	}
	minutes := map[string]int{"now": 0, "10": 10, "20": 20, "30": 30, "later": 0}
	delay, ok := minutes[choice]
	if !ok {
		return ErrInvalidSetting
	}
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `UPDATE urgent_request SET arrival_status=$2,estimated_departure_at=CASE WHEN $2='later' THEN NULL ELSE CURRENT_TIMESTAMP+($3 * interval '1 minute') END,
  arrival_updated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status NOT IN ('COMPLETED','CANCELLED')`, request.ID, choice, delay)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotChangeable
		}
		return audit(ctx, tx, "", "urgent:arrival", "", map[string]any{"urgentCode": request.BookingCode, "choice": choice})
	})
}

func (s *Store) CreateUrgentRecovery(ctx context.Context, code, email string, hash []byte) error {
	tag, err := s.pool.Exec(ctx, `INSERT INTO urgent_access(token_hash,request_id,expires_at,purpose)
SELECT $3,u.id,CURRENT_TIMESTAMP+interval '24 hours','recovery' FROM urgent_request u
 LEFT JOIN client c ON c.id=u.client_id LEFT JOIN app_user a ON a.id=c.user_id
 WHERE u.booking_code=$1 AND
 ((a.email_verified_at IS NOT NULL AND lower(a.email)=lower($2))
 OR (a.email_verified_at IS NULL AND lower(u.email)=lower($2)))`, code, email, hash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) RedeemUrgentRecovery(ctx context.Context, hash, ownerHash []byte) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		var id string
		err := tx.QueryRow(ctx, `UPDATE urgent_access SET used_at=CURRENT_TIMESTAMP WHERE token_hash=$1 AND purpose='recovery' AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP RETURNING request_id`, hash).Scan(&id)
		if err != nil {
			return notFound(err)
		}
		_, err = tx.Exec(ctx, "INSERT INTO urgent_access(token_hash,request_id,expires_at,purpose) VALUES($1,$2,CURRENT_TIMESTAMP+interval '24 hours','owner')", ownerHash, id)
		return err
	})
}

func (s *Store) ClientUrgentRequests(ctx context.Context, clientID string) ([]UrgentRequest, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+urgentColumns+` FROM urgent_request u LEFT JOIN location l ON l.id=u.location_id WHERE u.client_id::text=$1 ORDER BY u.submitted_at DESC`, clientID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[UrgentRequest])
}

func (s *Store) UrgentQueue(ctx context.Context, query, status, mode, location string, offset int) ([]UrgentRequest, map[string]int, int, error) {
	var total int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM (SELECT booking_code FROM urgent_request UNION SELECT code FROM booking WHERE code ~ '^ATT[0-9]{4}$') occupied`).Scan(&total); err != nil {
		return nil, nil, 0, err
	}
	counts := map[string]int{}
	rows, err := s.pool.Query(ctx, "SELECT status,count(*) FROM urgent_request GROUP BY status")
	if err != nil {
		return nil, nil, 0, err
	}
	for rows.Next() {
		var key string
		var count int
		if err = rows.Scan(&key, &count); err != nil {
			rows.Close()
			return nil, nil, 0, err
		}
		counts[key] = count
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return nil, nil, 0, err
	}
	var checked int
	if err = s.pool.QueryRow(ctx, "SELECT count(*) FROM urgent_request WHERE checked_in_at IS NOT NULL AND status NOT IN ('COMPLETED','CANCELLED')").Scan(&checked); err != nil {
		return nil, nil, 0, err
	}
	counts["checkedIn"] = checked
	rows, err = s.pool.Query(ctx, `SELECT `+urgentColumns+` FROM urgent_request u LEFT JOIN location l ON l.id=u.location_id
 WHERE ($1='' OR strpos(lower(u.booking_code||' '||u.customer_name||' '||u.email||' '||COALESCE(u.whatsapp_number,'')),lower($1))>0)
 AND ($2='' OR u.status=$2 OR ($2='CHECKED_IN' AND u.checked_in_at IS NOT NULL AND u.status NOT IN ('COMPLETED','CANCELLED')))
 AND ($3='' OR u.session_type=$3) AND ($4='' OR u.location_id=$4)
 ORDER BY u.submitted_at ASC,u.id ASC LIMIT 200 OFFSET $5`, query, status, mode, location, offset)
	if err != nil {
		return nil, nil, 0, err
	}
	requests, err := pgx.CollectRows(rows, pgx.RowToStructByPos[UrgentRequest])
	return requests, counts, total, err
}

func (s *Store) UrgentRecent(ctx context.Context, request UrgentRequest) (bool, error) {
	var recent bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM urgent_request WHERE lower(email)=lower($1) AND id<>$2 AND submitted_at>CURRENT_TIMESTAMP-interval '24 hours')`, request.Email, request.ID).Scan(&recent)
	return recent, err
}

// AccountLink reuses the email delivery, password hashing and session infrastructure.
func (s *Store) CreateClientAccountLink(ctx context.Context, clientID, email, purpose, actor string, hash []byte) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		var existing string
		if err := tx.QueryRow(ctx, "SELECT COALESCE(user_id::text,'') FROM client WHERE id::text=$1 FOR UPDATE", clientID).Scan(&existing); err != nil {
			return notFound(err)
		}
		if purpose == "activate" && existing != "" {
			return ErrNotChangeable
		}
		if _, err := tx.Exec(ctx, "UPDATE client_account_link SET used_at=CURRENT_TIMESTAMP WHERE client_id::text=$1 AND purpose=$2 AND used_at IS NULL", clientID, purpose); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO client_account_link(token_hash,client_id,actor_id,purpose,email,expires_at) VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP+interval '24 hours')`, hash, clientID, actor, purpose, email)
		return err
	})
}

func (s *Store) RedeemClientAccountLink(ctx context.Context, tokenHash []byte, passwordHash string) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		var clientID, actor, purpose, email string
		err := tx.QueryRow(ctx, `UPDATE client_account_link SET used_at=CURRENT_TIMESTAMP WHERE token_hash=$1 AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP
  RETURNING client_id,actor_id,purpose,email`, tokenHash).Scan(&clientID, &actor, &purpose, &email)
		if err != nil {
			return notFound(err)
		}
		var userID string
		if err = tx.QueryRow(ctx, "SELECT COALESCE(user_id::text,'') FROM client WHERE id=$1 FOR UPDATE", clientID).Scan(&userID); err != nil {
			return err
		}
		if purpose == "activate" {
			if userID != "" || passwordHash == "" {
				return ErrNotChangeable
			}
			if err = tx.QueryRow(ctx, "INSERT INTO app_user(email,password_hash,role,email_verified_at) VALUES($1,$2,'client',CURRENT_TIMESTAMP) RETURNING id", email, passwordHash).Scan(&userID); err != nil {
				return err
			}
			if _, err = tx.Exec(ctx, "UPDATE client SET user_id=$2,email=$3 WHERE id=$1", clientID, userID, email); err != nil {
				return err
			}
		} else {
			if _, err = tx.Exec(ctx, "UPDATE client SET email=$2 WHERE id=$1", clientID, email); err != nil {
				return err
			}
			if userID != "" {
				if _, err = tx.Exec(ctx, "UPDATE app_user SET email=$2,email_verified_at=CURRENT_TIMESTAMP WHERE id=$1", userID, email); err != nil {
					return err
				}
			}
		}
		return audit(ctx, tx, actor, "client:"+purpose, "", map[string]any{"clientId": clientID})
	})
}

func (s *Store) ClientAccountPurpose(ctx context.Context, hash []byte) (string, error) {
	var purpose string
	err := s.pool.QueryRow(ctx, "SELECT purpose FROM client_account_link WHERE token_hash=$1 AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP", hash).Scan(&purpose)
	return purpose, notFound(err)
}

func (s *Store) SetUrgentLocation(ctx context.Context, id, address, maps, actor string) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, "UPDATE location SET address=$2,maps_url=$3 WHERE id=$1", id, address, maps)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return audit(ctx, tx, actor, "location:contact", "", map[string]any{"locationId": id})
	})
}

// Keep encoding imports local to the lifecycle module for activity detail output.
func (s *Store) UrgentActivity(ctx context.Context, code string) ([]map[string]any, error) {
	rows, err := s.pool.Query(ctx, `SELECT jsonb_build_object('action',a.action,'at',a.at,'actor',COALESCE(u.email,
 CASE WHEN a.action IN ('urgent:arrival','urgent:submitted') THEN 'customer' ELSE 'system' END),'detail',a.detail)
 FROM audit_log a LEFT JOIN app_user u ON u.id=a.actor_id
 WHERE a.detail->>'urgentCode'=$1 OR a.booking_id=(SELECT appointment_id FROM urgent_request WHERE booking_code=$1) ORDER BY a.at`, code)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (map[string]any, error) {
		var raw []byte
		err := row.Scan(&raw)
		if err != nil {
			return nil, err
		}
		var entry map[string]any
		err = json.Unmarshal(raw, &entry)
		return entry, err
	})
}
