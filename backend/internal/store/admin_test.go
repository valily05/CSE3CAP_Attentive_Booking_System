package store_test

import (
	"errors"
	"testing"
	"time"

	"careconnect/internal/domain/booking"
	"careconnect/internal/domain/reports"
	"careconnect/internal/store"
)

func TestReportRows_OnlyBookingsInThePeriod(t *testing.T) {
	w := seed(t, 1)
	in, err := w.s.CreateBooking(ctx, w.booking(w.clients[0], tenAM))
	must(t, err)
	must(t, w.s.MarkAttendance(ctx, store.Attendance{BookingID: in.ID, Status: booking.NoShow, At: tenAM.Add(time.Hour)}))
	_, err = w.s.CreateBooking(ctx, w.booking(w.clients[0], tenAM.AddDate(0, 1, 0)))
	must(t, err)

	got, err := w.s.ReportRows(ctx, tenAM.AddDate(0, 0, -1), tenAM.AddDate(0, 0, 6))
	must(t, err)

	want := reports.Row{Status: booking.NoShow, PsychologistID: w.psychID, Place: "bsd", ServiceID: "adult-60"}
	if len(got) != 1 || got[0] != want {
		t.Fatalf("rows = %+v, want [%+v]", got, want)
	}
}

func TestSettings_DefaultsMatchTheAppendixAndCanBeChanged(t *testing.T) {
	s := seed(t, 0).s
	got, err := s.Settings(ctx)
	must(t, err)
	want := store.Settings{MinLead: 24 * time.Hour, ChangeCutoff: 8 * time.Hour, Break: 15 * time.Minute,
		ReminderFirst: 24 * time.Hour, ReminderSecond: 2 * time.Hour, FollowUpAfter: 60 * 24 * time.Hour, FollowUpCooldown: 30 * 24 * time.Hour}
	if got != want {
		t.Fatalf("defaults = %+v\nwant       %+v", got, want)
	}

	got.FollowUpAfter = 90 * 24 * time.Hour
	must(t, s.UpdateSettings(ctx, got, ""))
	again, err := s.Settings(ctx)
	must(t, err)
	if again.FollowUpAfter != 90*24*time.Hour {
		t.Fatalf("follow-up after = %v", again.FollowUpAfter)
	}
}

func TestSettings_FollowUpMustBe30_60Or90Days(t *testing.T) {
	s := seed(t, 0).s
	cur, err := s.Settings(ctx)
	must(t, err)
	cur.FollowUpAfter = 45 * 24 * time.Hour
	if err := s.UpdateSettings(ctx, cur, ""); !errors.Is(err, store.ErrInvalidSetting) {
		t.Fatalf("err = %v", err)
	}
}
