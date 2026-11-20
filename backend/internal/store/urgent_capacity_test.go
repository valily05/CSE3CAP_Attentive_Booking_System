package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/url"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

// This test owns a disposable database and never changes application data.
func TestUrgentCodeConstraintConcurrencyAndExhaustion(t *testing.T) {
	ctx := context.Background()
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		base = "postgres://careconnect:careconnect@localhost:5433/postgres?sslmode=disable"
	}
	admin, err := pgx.Connect(ctx, base)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = admin.Close(ctx) })
	suffix := make([]byte, 8)
	if _, err = rand.Read(suffix); err != nil {
		t.Fatal(err)
	}
	name := "urgent_test_" + hex.EncodeToString(suffix)
	if _, err = admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = admin.Exec(ctx, "DROP DATABASE "+name) })
	parsed, _ := url.Parse(base)
	parsed.Path = "/" + name
	s, err := Open(ctx, parsed.String())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if err = s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 11, 20, 10, 0, 0, 0, time.UTC)
	var group sync.WaitGroup
	for i := 0; i < 10; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			hash := make([]byte, 32)
			if _, err := rand.Read(hash); err != nil {
				t.Error(err)
				return
			}
			result, err := s.CreateUrgent(ctx, UrgentRequest{CustomerName: "Test", Email: "test@example.test", SessionType: "online"}, hash, now)
			if err != nil || result.Status != "PENDING" {
				t.Error(result, err)
			}
		}()
	}
	group.Wait()
	if _, err = s.pool.Exec(ctx, "UPDATE urgent_request SET submitted_at=submitted_at+interval '1 hour'"); err == nil {
		t.Fatal("submission timestamp was mutable")
	}
	var count int
	if err = s.pool.QueryRow(ctx, "SELECT count(DISTINCT booking_code) FROM urgent_request").Scan(&count); err != nil || count != 10 {
		t.Fatal(count, err)
	}
	_, err = s.pool.Exec(ctx, `INSERT INTO urgent_request(booking_code,customer_name,email,session_type,qr_token_hash,acknowledged_at,created_at,updated_at)
 SELECT 'ATT'||lpad(n::text,4,'0'),'Capacity Test','test@example.test','online',digest(n::text,'sha256'),$1,$1,$1
 FROM generate_series(0,9999) AS n ON CONFLICT(booking_code) DO NOTHING`, now)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.pool.Exec(ctx, `INSERT INTO urgent_request(booking_code,customer_name,email,session_type,qr_token_hash,acknowledged_at,created_at,updated_at)
 VALUES('ATT0000','Duplicate','test@example.test','online',digest('duplicate','sha256'),$1,$1,$1)`, now)
	if err == nil {
		t.Fatal("database accepted a duplicate booking code")
	}
	_, err = s.CreateUrgent(ctx, UrgentRequest{CustomerName: "Full Test", Email: "test@example.test", SessionType: "online"}, make([]byte, 32), now)
	if !errors.Is(err, ErrUrgentCapacity) {
		t.Fatalf("capacity: %v", err)
	}
}
