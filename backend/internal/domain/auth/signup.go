package auth

import (
	"errors"
	"net/mail"
	"regexp"
	"strings"
	"time"
	_ "time/tzdata"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrPrivacyRequired  = errors.New("you must agree to the privacy policy")
	ErrNameRequired     = errors.New("name is required")
	ErrInvalidEmail     = errors.New("email address is not valid")
	ErrInvalidPhone     = errors.New("phone number is not valid")
	ErrWeakPassword     = errors.New("password must have at least 8 characters")
	ErrInvalidResidence = errors.New("country, city and time zone are required and must match")
)

// SignUp is what a new client submits. CheckInConsent is optional and
// defaults to false (not ticked).
type SignUp struct {
	Name, Email, Phone, Password          string
	AgreedPrivacy                         bool
	CheckInConsent                        bool
	Country, OtherCountry, City, TimeZone string
}

// Indonesian mobile numbers: 08xx… or +628xx…, 10-14 digits in total.
var phonePattern = regexp.MustCompile(`^(?:\+62|62|0)8\d{8,11}$`)

// NormalizePhone strips spaces and dashes.
func NormalizePhone(p string) string {
	return strings.NewReplacer(" ", "", "-", "", "(", "", ")", "").Replace(strings.TrimSpace(p))
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
	case !(phonePattern.MatchString(NormalizePhone(s.Phone)) || regexp.MustCompile(`^\+[1-9][0-9]{6,14}$`).MatchString(NormalizePhone(s.Phone))):
		return ErrInvalidPhone
	case !ValidPassword(s.Password):
		return ErrWeakPassword
	}
	return ValidateResidence(s)
}

func ValidPassword(password string) bool {
	if utf8.RuneCountInString(password) < 8 || len(password) > 72 {
		return false
	}
	return true
}

func ValidateResidence(s SignUp) error {
	zones := map[string][]string{
		"ID": {"Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"},
		"SG": {"Asia/Singapore"}, "CN": {"Asia/Shanghai"}, "JP": {"Asia/Tokyo"},
		"AU":    {"Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Adelaide", "Australia/Darwin", "Australia/Perth", "Australia/Hobart", "Australia/Lord_Howe", "Australia/Eucla"},
		"OTHER": {},
	}
	allowed, ok := zones[s.Country]
	if !ok || len(strings.TrimSpace(s.City)) == 0 || len(s.City) > 160 || (s.Country == "OTHER" && (len(strings.TrimSpace(s.OtherCountry)) < 2 || len(s.OtherCountry) > 100)) {
		return ErrInvalidResidence
	}
	if _, err := time.LoadLocation(s.TimeZone); err != nil || s.TimeZone == "Local" || s.TimeZone == "" {
		return ErrInvalidResidence
	}
	if s.Country != "OTHER" {
		for _, zone := range allowed {
			if zone == s.TimeZone {
				return nil
			}
		}
		return ErrInvalidResidence
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
