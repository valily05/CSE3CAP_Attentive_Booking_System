package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"careconnect/internal/domain/booking"
	"careconnect/internal/domain/reports"
)

// ReportRows returns anonymous report rows for bookings starting in [from, to).
func (s *Store) ReportRows(ctx context.Context, from, to time.Time) ([]reports.Row, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT status, psychologist_id, COALESCE(location_id, 'online'), service_id
		FROM booking WHERE start_at >= $1 AND start_at < $2`, from, to)
	if err != nil {
		return nil, fmt.Errorf("report rows: %w", err)
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (reports.Row, error) {
		var row reports.Row
		var status string
		err := r.Scan(&status, &row.PsychologistID, &row.Place, &row.ServiceID)
		row.Status = booking.Status(status)
		return row, err
	})
}

// Settings are the admin-adjustable "starting numbers" (G09-9).
type Settings struct {
	MinLead          time.Duration `json:"minLead"`
	ChangeCutoff     time.Duration `json:"changeCutoff"` // time of day, WIB
	Break            time.Duration `json:"break"`
	ReminderFirst    time.Duration `json:"reminderFirst"`
	ReminderSecond   time.Duration `json:"reminderSecond"`
	FollowUpAfter    time.Duration `json:"followUpAfter"`
	FollowUpCooldown time.Duration `json:"followUpCooldown"`
}

// ErrInvalidSetting means a value is outside what the appendix allows.
var ErrInvalidSetting = errors.New("setting value is not allowed")

const day = 24 * time.Hour

func (st *Settings) fields() map[string]struct {
	ptr  *time.Duration
	unit time.Duration
} {
	type f = struct {
		ptr  *time.Duration
		unit time.Duration
	}
	return map[string]f{
		"min_lead_minutes":        {&st.MinLead, time.Minute},
		"change_cutoff_minute":    {&st.ChangeCutoff, time.Minute},
		"break_minutes":           {&st.Break, time.Minute},
		"reminder_first_minutes":  {&st.ReminderFirst, time.Minute},
		"reminder_second_minutes": {&st.ReminderSecond, time.Minute},
		"follow_up_days":          {&st.FollowUpAfter, day},
		"follow_up_cooldown_days": {&st.FollowUpCooldown, day},
	}
}

// Settings loads the current settings.
func (s *Store) Settings(ctx context.Context) (Settings, error) {
	var st Settings
	fields := st.fields()
	rows, err := s.pool.Query(ctx, `SELECT key, value FROM setting`)
	if err != nil {
		return st, err
	}
	defer rows.Close()
	for rows.Next() {
		var k string
		var v int
		if err := rows.Scan(&k, &v); err != nil {
			return st, err
		}
		if f, ok := fields[k]; ok {
			*f.ptr = time.Duration(v) * f.unit
		}
	}
	return st, rows.Err()
}

func (st Settings) validate() error {
	switch {
	case st.FollowUpAfter != 30*day && st.FollowUpAfter != 60*day && st.FollowUpAfter != 90*day:
		return fmt.Errorf("follow-up wait must be 30, 60 or 90 days: %w", ErrInvalidSetting)
	case st.ChangeCutoff < 0 || st.ChangeCutoff >= day:
		return fmt.Errorf("change cutoff must be a time of day: %w", ErrInvalidSetting)
	case st.ReminderSecond <= 0 || st.ReminderFirst <= st.ReminderSecond:
		return fmt.Errorf("first reminder must come before the second: %w", ErrInvalidSetting)
	case st.Break < 0 || st.Break > 2*time.Hour || st.MinLead < 0 || st.FollowUpCooldown < 0:
		return fmt.Errorf("negative or oversized value: %w", ErrInvalidSetting)
	}
	return nil
}

// UpdateSettings saves all settings and records the change in the history.
func (s *Store) UpdateSettings(ctx context.Context, st Settings, actorID string) error {
	if err := st.validate(); err != nil {
		return err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	for k, f := range st.fields() {
		if _, err := tx.Exec(ctx, `UPDATE setting SET value = $2 WHERE key = $1`, k, int(*f.ptr/f.unit)); err != nil {
			return err
		}
	}
	if err := audit(ctx, tx, actorID, "settings", "", map[string]any{"settings": st}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ClientSummary is what an admin sees when picking a client.
type ClientSummary struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Phone string `json:"phone"`
	Email string `json:"email"`
}

// SearchClients finds clients by name, email or phone (admin only).
func (s *Store) SearchClients(ctx context.Context, q string) ([]ClientSummary, error) {
	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, q)
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, phone, email FROM client
		WHERE name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%'
		   OR ($2 <> '' AND regexp_replace(phone, '\D', '', 'g') LIKE '%' || $2 || '%')
		ORDER BY name LIMIT 20`, q, digits)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[ClientSummary])
}

// HistoryEntry is one line of the admin change history.
type HistoryEntry struct {
	At     time.Time `json:"at"`
	Actor  string    `json:"actor"` // email of the staff member, or "system"
	Action string    `json:"action"`
	Code   string    `json:"code,omitempty"`
}

// History returns the newest changes first.
func (s *Store) History(ctx context.Context, limit int) ([]HistoryEntry, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT a.at, COALESCE(u.email, 'system'), a.action, COALESCE(b.code, '')
		FROM audit_log a
		LEFT JOIN app_user u ON u.id = a.actor_id
		LEFT JOIN booking b ON b.id = a.booking_id
		ORDER BY a.id DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[HistoryEntry])
}

// PsychologistNames maps IDs to names, for report labels.
func (s *Store) PsychologistNames(ctx context.Context) (map[string]string, error) {
	rows, err := s.pool.Query(ctx, `SELECT id::text, name FROM psychologist`)
	if err != nil {
		return nil, err
	}
	out := map[string]string{}
	defer rows.Close()
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		out[id] = name
	}
	return out, rows.Err()
}
