package auth_test

import (
	"errors"
	"strings"
	"testing"

	"careconnect/internal/domain/auth"
)

func validSignUp() auth.SignUp {
	return auth.SignUp{Name: "Rina Test", Email: "rina@example.test", Phone: "081234567890", Password: "correct horse", AgreedPrivacy: true}
}

func TestValidateSignUp(t *testing.T) {
	cases := []struct {
		name   string
		change func(*auth.SignUp)
		want   error
	}{
		{"valid", func(*auth.SignUp) {}, nil},
		{"+62 phone is fine", func(s *auth.SignUp) { s.Phone = "+62 812-3456-7890" }, nil},
		{"privacy policy must be ticked", func(s *auth.SignUp) { s.AgreedPrivacy = false }, auth.ErrPrivacyRequired},
		{"name required", func(s *auth.SignUp) { s.Name = "  " }, auth.ErrNameRequired},
		{"bad email", func(s *auth.SignUp) { s.Email = "rina.example.test" }, auth.ErrInvalidEmail},
		{"bad phone", func(s *auth.SignUp) { s.Phone = "12345" }, auth.ErrInvalidPhone},
		{"short password", func(s *auth.SignUp) { s.Password = "short" }, auth.ErrWeakPassword},
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
	hash, err := auth.HashPassword("correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(hash, "correct horse") {
		t.Fatal("hash contains the plain password")
	}
	if !auth.CheckPassword(hash, "correct horse") {
		t.Fatal("right password rejected")
	}
	if auth.CheckPassword(hash, "wrong horse") {
		t.Fatal("wrong password accepted")
	}
}
