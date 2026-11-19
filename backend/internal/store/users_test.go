package store_test

import (
	"errors"
	"testing"
	"time"

	"careconnect/internal/domain/auth"
	"careconnect/internal/store"
	"careconnect/internal/store/storetest"
)

func TestCreateUser_EmailIsUniqueIgnoringCase(t *testing.T) {
	s := storetest.New(t)
	_, err := s.CreateUser(ctx, store.NewUser{Email: "Rina@Example.test", PasswordHash: "x", Role: "client"})
	must(t, err)
	_, err = s.CreateUser(ctx, store.NewUser{Email: "rina@example.TEST", PasswordHash: "x", Role: "client"})
	if !errors.Is(err, store.ErrEmailTaken) {
		t.Fatalf("err = %v, want ErrEmailTaken", err)
	}
}

func TestLoginAttempts_RoundTrip(t *testing.T) {
	s := storetest.New(t)
	id, err := s.CreateUser(ctx, store.NewUser{Email: "a@example.test", PasswordHash: "x", Role: "client"})
	must(t, err)
	locked := auth.Attempts{Failures: 5, LockedUntil: tenAM}
	must(t, s.SaveAttempts(ctx, id, locked))

	u, err := s.UserByEmail(ctx, "A@example.test")
	must(t, err)
	if u.ID != id || u.Attempts.Failures != 5 || !u.Attempts.LockedUntil.Equal(tenAM) || u.Role != "client" {
		t.Fatalf("user = %+v", u)
	}
}

func TestSession_ExpiredSessionIsNotFound(t *testing.T) {
	s := storetest.New(t)
	id, err := s.CreateUser(ctx, store.NewUser{Email: "a@example.test", PasswordHash: "x", Role: "admin"})
	must(t, err)
	must(t, s.CreateSession(ctx, []byte("hash"), id, tenAM))

	u, err := s.SessionUser(ctx, []byte("hash"), tenAM.Add(-time.Minute))
	must(t, err)
	if u.ID != id || u.Role != "admin" {
		t.Fatalf("session user = %+v", u)
	}
	if _, err := s.SessionUser(ctx, []byte("hash"), tenAM); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expired session = %v", err)
	}
}

func TestEmailToken_WorksOnceAndOnlyForItsPurpose(t *testing.T) {
	s := storetest.New(t)
	id, err := s.CreateUser(ctx, store.NewUser{Email: "a@example.test", PasswordHash: "x", Role: "client"})
	must(t, err)
	must(t, s.CreateEmailToken(ctx, []byte("tok"), id, "reset_password", tenAM))

	if _, err := s.UseEmailToken(ctx, []byte("tok"), "verify_email", tenAM.Add(-time.Hour)); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("wrong purpose = %v", err)
	}
	got, err := s.UseEmailToken(ctx, []byte("tok"), "reset_password", tenAM.Add(-time.Hour))
	must(t, err)
	if got != id {
		t.Fatalf("token user = %s", got)
	}
	if _, err := s.UseEmailToken(ctx, []byte("tok"), "reset_password", tenAM.Add(-time.Hour)); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("second use = %v", err)
	}
}
