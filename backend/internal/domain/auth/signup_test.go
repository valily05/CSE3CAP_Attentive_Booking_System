package auth_test

import (
	"errors"
	"strings"
	"testing"

	"careconnect/internal/domain/auth"
)

func validSignUp() auth.SignUp {
	return auth.SignUp{Name: "Rina Test", Email: "rina@example.test", Phone: "081234567890", Password: "correct horse!", AgreedPrivacy: true, Country: "ID", City: "Jakarta", TimeZone: "Asia/Jakarta"}
}

func TestValidateSignUp(t *testing.T) {
	cases := []struct {
		name   string
		change func(*auth.SignUp)
		want   error
	}{
		{"valid", func(*auth.SignUp) {}, nil},
		{"foreign phone with Indonesian residence", func(s *auth.SignUp) { s.Phone = "+65 8123 4567" }, nil},
		{"+62 phone is fine", func(s *auth.SignUp) { s.Phone = "+62 812-3456-7890" }, nil},
		{"privacy policy must be ticked", func(s *auth.SignUp) { s.AgreedPrivacy = false }, auth.ErrPrivacyRequired},
		{"name required", func(s *auth.SignUp) { s.Name = "  " }, auth.ErrNameRequired},
		{"bad email", func(s *auth.SignUp) { s.Email = "rina.example.test" }, auth.ErrInvalidEmail},
		{"bad phone", func(s *auth.SignUp) { s.Phone = "12345" }, auth.ErrInvalidPhone},
		{"short password", func(s *auth.SignUp) { s.Password = "short" }, auth.ErrWeakPassword},
		{"missing country", func(s *auth.SignUp) { s.Country = "" }, auth.ErrInvalidResidence},
		{"missing city", func(s *auth.SignUp) { s.City = " " }, auth.ErrInvalidResidence},
		{"wrong country zone", func(s *auth.SignUp) { s.TimeZone = "Asia/Tokyo" }, auth.ErrInvalidResidence},
		{"Singapore", func(s *auth.SignUp) {
			s.Country = "SG"
			s.City = "Singapore"
			s.TimeZone = "Asia/Singapore"
			s.Phone = "+65 8123 4567"
		}, nil},
		{"Other requires country name", func(s *auth.SignUp) { s.Country = "OTHER"; s.TimeZone = "Europe/London" }, auth.ErrInvalidResidence},
		{"Other accepts IANA zone", func(s *auth.SignUp) {
			s.Country = "OTHER"
			s.OtherCountry = "United Kingdom"
			s.City = "London"
			s.TimeZone = "Europe/London"
		}, nil},
		{"bad IANA zone", func(s *auth.SignUp) { s.Country = "OTHER"; s.OtherCountry = "Example"; s.TimeZone = "GMT+100" }, auth.ErrInvalidResidence},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := validSignUp()
			tc.change(&s)
			if err := auth.ValidateSignUp(s); !errors.Is(err, tc.want) {
				t.Fatalf("ValidateSignUp() = %v, want %v", err, tc.want)
			}
		})
	}
}

func TestPasswordHash_VerifiesOnlyTheRightPassword(t *testing.T) {
	hash, err := auth.HashPassword("correct horse!")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(hash, "correct horse!") {
		t.Fatal("hash contains the plain password")
	}
	if !auth.CheckPassword(hash, "correct horse!") {
		t.Fatal("right password rejected")
	}
	if auth.CheckPassword(hash, "wrong horse") {
		t.Fatal("wrong password accepted")
	}
}

func TestValidPhoneIndependentOfResidence(t *testing.T) {
	for _, number := range []string{"081234567890", "+6281234567890", "+65 8123 4567"} {
		if !auth.ValidPhone(number) {
			t.Errorf("valid contact number rejected: %q", number)
		}
	}
	for _, number := range []string{"", "abc", "123", "+012345678"} {
		if auth.ValidPhone(number) {
			t.Errorf("invalid contact number accepted: %q", number)
		}
	}
}
