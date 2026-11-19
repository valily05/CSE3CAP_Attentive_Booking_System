package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"careconnect/internal/domain/schedule"
	"careconnect/internal/domain/wib"
)

// SetWeeklyHours replaces a psychologist's weekly pattern after validating it.
func (s *Store) SetWeeklyHours(ctx context.Context, psychID string, hours []schedule.WeeklyHours) error {
	if err := schedule.ValidateHours(hours); err != nil {
		return err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `DELETE FROM weekly_hours WHERE psychologist_id = $1`, psychID); err != nil {
		return err
	}
	for _, h := range hours {
		if _, err := tx.Exec(ctx, `
			INSERT INTO weekly_hours (psychologist_id, weekday, start_minute, end_minute, mode, location_id)
			VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''))`,
			psychID, int(h.Weekday), int(h.Start), int(h.End), string(h.Mode), h.LocationID); err != nil {
			return fmt.Errorf("weekly hours: %w", err)
		}
	}
	return tx.Commit(ctx)
}

// WeeklyHours returns a psychologist's weekly pattern.
func (s *Store) WeeklyHours(ctx context.Context, psychID string) ([]schedule.WeeklyHours, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT weekday, start_minute, end_minute, mode, COALESCE(location_id, '')
		FROM weekly_hours WHERE psychologist_id = $1 ORDER BY weekday, start_minute`, psychID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (schedule.WeeklyHours, error) {
		var h schedule.WeeklyHours
		var wd, st, en int16
		var mode string
		err := r.Scan(&wd, &st, &en, &mode, &h.LocationID)
		h.Weekday, h.Start, h.End, h.Mode = time.Weekday(wd), schedule.Minute(st), schedule.Minute(en), schedule.Mode(mode)
		return h, err
	})
}

// Unavailability is time off (days) or a block (a single meeting).
type Unavailability struct {
	ID             string    `json:"id"`
	PsychologistID string    `json:"psychologistId"`
	Kind           string    `json:"kind"` // time_off | block
	Start          time.Time `json:"start"`
	End            time.Time `json:"end"`
	Label          string    `json:"label"`
}

// AddUnavailability records time off or a block.
func (s *Store) AddUnavailability(ctx context.Context, u Unavailability) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO unavailability (psychologist_id, kind, starts_at, ends_at, label) VALUES ($1, $2, $3, $4, $5)`,
		u.PsychologistID, u.Kind, u.Start, u.End, u.Label)
	if err != nil {
		return fmt.Errorf("add unavailability: %w", err)
	}
	return nil
}

// DaySchedule is everything slot calculation needs for one psychologist-day.
type DaySchedule struct {
	Hours       []schedule.WeeklyHours
	Unavailable []schedule.Interval
	Booked      []schedule.Interval
}

// DaySchedule loads hours, time off/blocks and slot-holding bookings that
// touch the WIB day containing day.
func (s *Store) DaySchedule(ctx context.Context, psychID string, day time.Time) (DaySchedule, error) {
	from := wib.StartOfDay(day)
	return s.ScheduleRange(ctx, psychID, from, from.AddDate(0, 0, 1), "")
}

// ScheduleRange loads schedule data touching [from, to) in three queries,
// however many days the range covers. excludeBookingID (optional) leaves one
// booking out, so a booking being moved does not block its own new time.
func (s *Store) ScheduleRange(ctx context.Context, psychID string, from, to time.Time, excludeBookingID string) (DaySchedule, error) {
	var out DaySchedule
	var err error
	if out.Hours, err = s.WeeklyHours(ctx, psychID); err != nil {
		return out, err
	}
	if out.Unavailable, err = s.intervals(ctx, `
		SELECT starts_at, ends_at FROM unavailability
		WHERE psychologist_id = $1 AND starts_at < $3 AND ends_at > $2`, psychID, from, to); err != nil {
		return out, err
	}
	out.Booked, err = s.intervals(ctx, `
		SELECT start_at, end_at FROM booking
		WHERE psychologist_id = $1 AND start_at < $3 AND blocked_until > $2
		  AND status IN ('waiting_payment', 'confirmed', 'attended', 'no_show')
		  AND id::text <> $4`, psychID, from, to, excludeBookingID)
	return out, err
}

func (s *Store) intervals(ctx context.Context, sql string, args ...any) ([]schedule.Interval, error) {
	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (schedule.Interval, error) {
		var i schedule.Interval
		err := r.Scan(&i.Start, &i.End)
		return i, err
	})
}

// PsychologistEmail returns the login email of a psychologist, or "" if
// they have no account yet.
func (s *Store) PsychologistEmail(ctx context.Context, psychID string) (string, error) {
	var e *string
	err := s.pool.QueryRow(ctx, `SELECT u.email FROM psychologist p LEFT JOIN app_user u ON u.id = p.user_id WHERE p.id = $1`, psychID).Scan(&e)
	if err != nil || e == nil {
		return "", notFound(err)
	}
	return *e, nil
}
