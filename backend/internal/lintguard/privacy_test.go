package lintguard_test

import (
	"os"
	"strings"
	"testing"
	"testing/fstest"

	"careconnect/internal/lintguard"
)

func TestScan_FindsClinicalFieldsInGoAndSQL(t *testing.T) {
	fsys := fstest.MapFS{
		"internal/x/model.go": {Data: []byte("package x\ntype Booking struct {\n\tID string\n\tDiagnosis string\n}\n")},
		"internal/x/ok.go":    {Data: []byte("package x\n// we never store a diagnosis\nvar note = \"therapy notes are forbidden\"\n")},
		"migrations/001.sql":  {Data: []byte("CREATE TABLE booking (\n  id uuid,\n  therapy_notes text -- nope\n);\n-- session_notes in a comment is fine\n")},
	}

	got := lintguard.ScanPrivacy(fsys)

	want := []string{"internal/x/model.go:4 Diagnosis", "migrations/001.sql:3 therapy_notes"}
	if len(got) != len(want) {
		t.Fatalf("findings = %v, want %v", got, want)
	}
	for i := range want {
		if got[i].String() != want[i] {
			t.Fatalf("findings = %v, want %v", got, want)
		}
	}
}

// TestRepository_HasNoClinicalFields is the real rule: Scope Update §13
// forbids storing therapy notes, diagnoses or anything said in a session.
func TestRepository_HasNoClinicalFields(t *testing.T) {
	findings := lintguard.ScanPrivacy(os.DirFS("../.."))
	if len(findings) > 0 {
		var b strings.Builder
		for _, f := range findings {
			b.WriteString("\n  " + f.String())
		}
		t.Fatalf("clinical data fields are not allowed (Scope §13):%s", b.String())
	}
}
