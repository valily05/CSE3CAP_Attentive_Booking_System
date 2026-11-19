package booking_test

import (
	"bytes"
	"crypto/rand"
	"regexp"
	"testing"

	"careconnect/internal/domain/booking"
)

func TestNewCode_UsesUnambiguousCharacters(t *testing.T) {
	// Bytes index the alphabet 23456789ABCDEFGHJKMNPQRSTUVWXYZ; 255 is
	// rejected to avoid modulo bias, so the 5th byte is used instead.
	code, err := booking.NewCode(bytes.NewReader([]byte{0, 8, 255, 30, 15}))
	if err != nil {
		t.Fatal(err)
	}
	if code != "ATT-2AZH" {
		t.Fatalf("NewCode() = %q, want ATT-2AZH", code)
	}
}

func TestNewCode_RandomCodesNeverContainLookalikes(t *testing.T) {
	pattern := regexp.MustCompile(`^ATT-[2-9A-HJKMNP-Z]{4}$`)
	for range 500 {
		code, err := booking.NewCode(rand.Reader)
		if err != nil {
			t.Fatal(err)
		}
		if !pattern.MatchString(code) {
			t.Fatalf("code %q has an ambiguous character", code)
		}
	}
}
