// Command seed fills a development database with test data only (Scope §14):
// 17 psychologists, 3 services, 3 locations plus online, 60 clients and
// eight weeks of past and upcoming bookings. Nobody here is real.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"math/rand/v2" //nolint:forbidigo // fake data only; deterministic on purpose
	"os"
	"time"

	"careconnect/internal/domain/auth"
	"careconnect/internal/domain/booking"
	"careconnect/internal/domain/schedule"
	"careconnect/internal/domain/wib"
	"careconnect/internal/store"
)

var (
	firstNames = []string{"Ayu", "Budi", "Citra", "Dimas", "Eka", "Fajar", "Gita", "Hendra", "Indah", "Joko", "Kartika", "Lukman", "Maya", "Nanda", "Oki", "Putri", "Rizky", "Sari", "Tono", "Umi", "Vina", "Wahyu", "Yuni", "Zaki"}
	lastNames  = []string{"Lestari", "Santoso", "Wijaya", "Pratama", "Siregar", "Nugroho", "Halim", "Kusuma", "Saputra", "Rahayu", "Hidayat", "Utami", "Gunawan", "Permata", "Setiawan"}
	specialty  = []string{"Stress & work-life balance", "Relationships", "Parenting & child development", "Adolescent wellbeing", "Grief & life transitions", "Career & study", "Family communication", "Self-esteem"}
)

func main() {
	reset := flag.Bool("reset", false, "delete all existing data first")
	flag.Parse()
	if err := run(*reset); err != nil {
		slog.Error("seed failed", "err", err)
		os.Exit(1)
	}
}

func run(reset bool) error {
	ctx := context.Background()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://careconnect:careconnect@localhost:5433/careconnect?sslmode=disable" //nolint:gosec // local docker-compose dev DB
	}
	s, err := store.Open(ctx, url)
	if err != nil {
		return err
	}
	defer s.Close()
	if reset {
		if err := s.ResetForSeed(ctx); err != nil {
			return err
		}
	}
	if err := s.Migrate(ctx); err != nil {
		return err
	}
	r := rand.New(rand.NewPCG(9, 2026)) //nolint:gosec // repeatable fake data, not security

	for _, l := range []store.Location{{ID: "jakarta", Name: "Jakarta"}, {ID: "bsd", Name: "BSD (Tangerang)"}, {ID: "malang", Name: "Malang"}} {
		if err := s.UpsertLocation(ctx, l); err != nil {
			return err
		}
	}
	services := []store.Service{
		{ID: "adult-60", Name: "Adult counseling", LengthMinutes: 60, AgeGroup: "adult"},
		{ID: "child-teen-90", Name: "Child & teen counseling", LengthMinutes: 90, AgeGroup: "child_teen"},
		{ID: "family-couple-120", Name: "Family & couple counseling", LengthMinutes: 120, AgeGroup: "family_couple"},
	}
	for _, sv := range services {
		if err := s.UpsertService(ctx, sv); err != nil {
			return err
		}
	}

	staffPass, err := auth.HashPassword("attentive-staff")
	if err != nil {
		return err
	}
	if _, err := s.CreateUser(ctx, store.NewUser{Email: "admin@attentive.test", PasswordHash: staffPass, Role: "admin", Verified: true}); err != nil && !errors.Is(err, store.ErrEmailTaken) {
		return err
	}

	locations := []string{"jakarta", "bsd", "malang"}
	var psychs []string
	for i := range 17 {
		name := firstNames[i] + " " + lastNames[i%len(lastNames)]
		loc := locations[i%3]
		svcIDs := []string{"adult-60"}
		if i%2 == 0 {
			svcIDs = append(svcIDs, "child-teen-90")
		}
		if i%3 == 0 {
			svcIDs = append(svcIDs, "family-couple-120")
		}
		types := []string{"video", "chat", "voice"}
		locIDs := []string{}
		if i%4 != 3 { // a few are online only
			types = append(types, "in_person")
			locIDs = []string{loc}
		}
		id, err := s.CreatePsychologist(ctx, store.NewPsychologist{
			Name: name, Title: "M.Psi., Psikolog", Specialty: specialty[i%len(specialty)],
			Bio: "Test profile for development. Not a real person.", SessionTypes: types, LocationIDs: locIDs, ServiceIDs: svcIDs,
		})
		if err != nil {
			return err
		}
		psychs = append(psychs, id)

		hours := []schedule.WeeklyHours{}
		for d := time.Monday; d <= time.Saturday; d++ {
			if (int(d)+i)%3 == 0 {
				continue // a day off
			}
			if len(locIDs) > 0 && d%2 == 1 {
				hours = append(hours, schedule.WeeklyHours{Weekday: d, Start: schedule.HM(9, 0), End: schedule.HM(13, 0), Mode: schedule.InPerson, LocationID: loc},
					schedule.WeeklyHours{Weekday: d, Start: schedule.HM(14, 0), End: schedule.HM(17, 0), Mode: schedule.Online})
			} else {
				hours = append(hours, schedule.WeeklyHours{Weekday: d, Start: schedule.HM(10, 0), End: schedule.HM(18, 0), Mode: schedule.Online})
			}
		}
		if err := s.SetWeeklyHours(ctx, id, hours); err != nil {
			return err
		}
		if i == 0 {
			u, err := s.CreateUser(ctx, store.NewUser{Email: "ayu@attentive.test", PasswordHash: staffPass, Role: "psychologist", Verified: true})
			if err == nil {
				err = s.LinkPsychologistUser(ctx, id, u)
			}
			if err != nil && !errors.Is(err, store.ErrEmailTaken) {
				return err
			}
		}
	}

	clientPass, err := auth.HashPassword("attentive-client")
	if err != nil {
		return err
	}
	var clients []string
	for i := range 60 {
		name := firstNames[(i*7)%len(firstNames)] + " " + lastNames[(i*5)%len(lastNames)]
		emailAddr := fmt.Sprintf("client%02d@example.test", i)
		userID := ""
		if i == 0 {
			name, emailAddr = "Rina Test", "rina@example.test"
		}
		if i < 5 { // a few can log in
			u, err := s.CreateUser(ctx, store.NewUser{Email: emailAddr, PasswordHash: clientPass, Role: "client", Verified: true})
			if err != nil {
				return err
			}
			userID = u
		}
		id, err := s.CreateClient(ctx, store.NewClient{
			UserID: userID, Name: name, Email: emailAddr, Phone: fmt.Sprintf("08123%07d", i),
			AgreedToMessages: i%3 != 0, Locale: map[bool]string{true: "en", false: "id"}[i%4 == 0],
		})
		if err != nil {
			return err
		}
		clients = append(clients, id)
	}

	// Bookings from 8 weeks ago to 2 weeks ahead, on each psychologist's online hours.
	today := wib.StartOfDay(time.Now())
	made := 0
	for day := today.AddDate(0, 0, -56); day.Before(today.AddDate(0, 0, 14)); day = day.AddDate(0, 0, 1) {
		for pi, p := range psychs {
			if r.IntN(3) != 0 {
				continue
			}
			start := day.Add(time.Duration(10+r.IntN(6)) * time.Hour)
			c := clients[r.IntN(len(clients))]
			b, err := s.CreateBooking(ctx, store.NewBooking{
				ClientID: c, PsychologistID: p, ServiceID: "adult-60", Mode: schedule.Online, OnlineChannel: "video",
				Start: start, End: start.Add(time.Hour), Break: 15 * time.Minute,
			})
			if errors.Is(err, store.ErrSlotTaken) {
				continue
			}
			if err != nil {
				return err
			}
			made++
			if !start.Before(today) {
				continue
			}
			var status booking.Status
			switch n := r.IntN(10); {
			case n < 7:
				status = booking.Attended
			case n < 9:
				status = booking.NoShow
			default:
				err = s.CancelBooking(ctx, store.Cancellation{BookingID: b.ID, Reason: "schedule_conflict", At: start.Add(-48 * time.Hour)})
			}
			if status != "" {
				err = s.MarkAttendance(ctx, store.Attendance{BookingID: b.ID, Status: status, At: start.Add(time.Hour)})
			}
			if err != nil {
				return fmt.Errorf("psych %d: %w", pi, err)
			}
		}
	}

	slog.Info("seeded test data", "psychologists", len(psychs), "clients", len(clients), "bookings", made)
	slog.Info("test logins (development only)",
		"admin", "admin@attentive.test / attentive-staff",
		"psychologist", "ayu@attentive.test / attentive-staff",
		"client", "rina@example.test / attentive-client")
	return nil
}
