package auth_test

import (
	"careconnect/internal/domain/auth"
	"strings"
	"testing"
)

func TestNewPasswordRules(t *testing.T) {
	for _, c := range []struct {
		value string
		valid bool
	}{{"abcdefgh", true}, {"abcdef!", false}, {"abcdefg!", true}, {"abc defg", true}, {"密码密码密码密码!", true}, {strings.Repeat("a", 72) + "!", false}} {
		if got := auth.ValidPassword(c.value); got != c.valid {
			t.Errorf("password rules: got %v want %v", got, c.valid)
		}
	}
}
