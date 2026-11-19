package store_test

import (
	"context"
	"testing"

	"careconnect/internal/store/storetest"
)

func TestMigrate_IsSafeToRunTwice(t *testing.T) {
	s := storetest.New(t) // already migrated once from the template
	if err := s.Migrate(context.Background()); err != nil {
		t.Fatalf("second Migrate() = %v", err)
	}
}
