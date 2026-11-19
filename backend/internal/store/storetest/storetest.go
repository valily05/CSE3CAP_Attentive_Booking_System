// Package storetest gives each test its own real Postgres database, cloned
// from a migrated template so it takes milliseconds, not seconds.
package storetest

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5"

	"careconnect/internal/store"
	"careconnect/migrations"
)

const defaultAdminURL = "postgres://careconnect:careconnect@localhost:5433/postgres?sslmode=disable" //nolint:gosec // throwaway local docker-compose test DB; override with TEST_DATABASE_URL

var (
	templateOnce sync.Once
	templateName string
	templateErr  error
)

func adminURL() string {
	if u := os.Getenv("TEST_DATABASE_URL"); u != "" {
		return u
	}
	return defaultAdminURL
}

func withDB(base, db string) string {
	u, _ := url.Parse(base)
	u.Path = "/" + db
	return u.String()
}

func exec(ctx context.Context, sql string) error {
	conn, err := pgx.Connect(ctx, adminURL())
	if err != nil {
		return err
	}
	defer conn.Close(ctx)
	_, err = conn.Exec(ctx, sql)
	return err
}

// migrationsHash names the template after the schema, so a changed
// migration automatically gets a fresh template.
func migrationsHash() (string, error) {
	h := sha256.New()
	names, err := fs.Glob(migrations.FS, "*.sql")
	if err != nil {
		return "", err
	}
	for _, n := range names {
		b, err := fs.ReadFile(migrations.FS, n)
		if err != nil {
			return "", err
		}
		h.Write([]byte(n))
		h.Write(b)
	}
	return hex.EncodeToString(h.Sum(nil))[:12], nil
}

// buildTemplate is safe across parallel `go test` processes: an advisory
// lock makes one process build the template while the others wait.
func buildTemplate(ctx context.Context) (string, error) {
	hash, err := migrationsHash()
	if err != nil {
		return "", err
	}
	name := "cc_tpl_" + hash
	conn, err := pgx.Connect(ctx, adminURL())
	if err != nil {
		return "", fmt.Errorf("connect to test Postgres (is `docker compose up -d` running?): %w", err)
	}
	defer conn.Close(ctx)
	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock(424242)"); err != nil {
		return "", err
	}
	defer func() { _, _ = conn.Exec(ctx, "SELECT pg_advisory_unlock(424242)") }()

	var exists bool
	if err := conn.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1)", name).Scan(&exists); err != nil {
		return "", err
	}
	if exists {
		return name, nil
	}
	// Remove templates from older schema versions.
	rows, err := conn.Query(ctx, "SELECT datname FROM pg_database WHERE datname LIKE 'cc_tpl_%'")
	if err != nil {
		return "", err
	}
	old, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return "", err
	}
	for _, o := range old {
		_, _ = conn.Exec(ctx, "DROP DATABASE IF EXISTS "+o+" WITH (FORCE)")
	}
	if _, err := conn.Exec(ctx, "CREATE DATABASE "+name+"_wip"); err != nil {
		return "", err
	}
	s, err := store.Open(ctx, withDB(adminURL(), name+"_wip"))
	if err != nil {
		return "", err
	}
	err = s.Migrate(ctx)
	s.Close()
	if err != nil {
		_, _ = conn.Exec(ctx, "DROP DATABASE IF EXISTS "+name+"_wip WITH (FORCE)")
		return "", err
	}
	if _, err := conn.Exec(ctx, "ALTER DATABASE "+name+"_wip RENAME TO "+name); err != nil {
		return "", err
	}
	return name, nil
}

// URL returns the connection URL of a fresh, migrated, empty database that
// is dropped when the test ends.
func URL(t testing.TB) string {
	t.Helper()
	if testing.Short() {
		t.Skip("database tests skipped with -short")
	}
	ctx := context.Background()
	templateOnce.Do(func() { templateName, templateErr = buildTemplate(ctx) })
	if templateErr != nil {
		t.Fatal(templateErr)
	}
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	name := "cc_test_" + hex.EncodeToString(b)
	if err := exec(ctx, fmt.Sprintf("CREATE DATABASE %s TEMPLATE %s", name, templateName)); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = exec(context.Background(), "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)") })
	return withDB(adminURL(), name)
}

// New opens a Store on a fresh database.
func New(t testing.TB) *store.Store {
	t.Helper()
	s, err := store.Open(context.Background(), URL(t))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.Close)
	return s
}
