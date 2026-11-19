package auth

import (
	"errors"
	"net/mail"
	"regexp"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrPrivacyRequired = errors.New("you must agree to the privacy policy")
	ErrNameRequired    = errors.New("name is required")
	ErrInvalidEmail    = errors.New("email address is not valid")
	ErrInvalidPhone    = errors.New("phone number is not valid")
	ErrWeakPassword    = errors.New("password must be at least 8 characters")
)

// SignUp is what a new client submits. CheckInConsent is optional and
// defaults to false (not ticked).
type SignUp struct {
	Name, Email, Phone, Password string
	AgreedPrivacy                bool
	CheckInConsent               bool
}

// Indonesian mobile numbers: 08xx… or +628xx…, 10-14 digits in total.
var phonePattern = regexp.MustCompile(`^(?:\+62|62|0)8\d{8,11}$`)

// NormalizePhone strips spaces and dashes.
func NormalizePhone(p string) string {
	return strings.NewReplacer(" ", "", "-", "").Replace(strings.TrimSpace(p))
}

// ValidateSignUp checks a sign-up form.
func ValidateSignUp(s SignUp) error {
	switch {
	case !s.AgreedPrivacy:
		return ErrPrivacyRequired
	case strings.TrimSpace(s.Name) == "":
		return ErrNameRequired
	case !validEmail(s.Email):
		return ErrInvalidEmail
	case !phonePattern.MatchString(NormalizePhone(s.Phone)):
		return ErrInvalidPhone
	case len(s.Password) < 8:
		return ErrWeakPassword
	}
	return nil
}

func validEmail(e string) bool {
	a, err := mail.ParseAddress(e)
	return err == nil && a.Address == e && strings.Contains(e[strings.LastIndex(e, "@"):], ".")
}

// HashPassword stores passwords with bcrypt so nobody can read them.
func HashPassword(p string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(p), bcrypt.DefaultCost)
	return string(h), err
}

// CheckPassword reports whether p matches hash.
func CheckPassword(hash, p string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(p)) == nil
}
