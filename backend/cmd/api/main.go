// Command api runs the Care Connect JSON API and its background jobs.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"careconnect/internal/app"
	"careconnect/internal/domain/wib"
	"careconnect/internal/httpapi"
	"careconnect/internal/platform/clock"
	"careconnect/internal/platform/mail"
	"careconnect/internal/store"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	slog.SetDefault(log)
	if err := run(log); err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	st, err := store.Open(ctx, env("DATABASE_URL", "postgres://careconnect:careconnect@localhost:5433/careconnect?sslmode=disable"))
	if err != nil {
		return err
	}
	defer st.Close()
	if err := st.Migrate(ctx); err != nil {
		return err
	}

	// Brevo, Mailgun and SendGrid all offer SMTP. Credentials only ever come
	// from the environment (Scope §13). Default: local Mailpit.
	sender := mail.SMTP{
		Addr: env("SMTP_ADDR", "localhost:1025"), From: env("SMTP_FROM", "Attentive <no-reply@attentive.test>"),
		User: os.Getenv("SMTP_USER"), Password: os.Getenv("SMTP_PASSWORD"),
	}
	a := app.New(app.Deps{Store: st, Clock: clock.System{}, Mail: sender, BaseURL: env("PUBLIC_URL", "http://localhost:3000"), Log: log})

	if env("RUN_JOBS", "true") == "true" {
		go jobs(ctx, a, log)
	}

	srv := &http.Server{Addr: env("HTTP_ADDR", ":8080"), Handler: httpapi.New(a), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()
	log.Info("api listening", "addr", srv.Addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// jobs runs reminders every 15 minutes (G09-6) and follow-ups once a day
// after 09:00 WIB (G09-8).
func jobs(ctx context.Context, a *app.App, log *slog.Logger) {
	tick := time.NewTicker(15 * time.Minute)
	defer tick.Stop()
	lastFollowUp := ""
	for {
		if err := a.RunReminders(ctx); err != nil {
			log.Error("reminders", "err", err)
		}
		now := time.Now().In(wib.Zone)
		if today := now.Format(time.DateOnly); now.Hour() >= 9 && today != lastFollowUp {
			if err := a.RunFollowUps(ctx); err != nil {
				log.Error("follow-ups", "err", err)
			} else {
				lastFollowUp = today
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}
