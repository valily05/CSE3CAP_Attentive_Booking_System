package email_test

import (
	"strings"
	"testing"
	"time"

	"careconnect/internal/domain/wib"
	"careconnect/internal/email"
)

func TestCatalogs_HaveTheSameKeys(t *testing.T) {
	if missing := email.CatalogDiff(); len(missing) > 0 {
		t.Fatalf("catalog keys out of sync: %v", missing)
	}
}

func TestVerificationHTMLButtonUsesEscapedTokenLink(t *testing.T) {
	link := "https://attentive.example/verify?token=single-use-token"
	message := email.Render("en", email.VerifyEmail, email.Data{FirstName: "<script>alert(1)</script>", Link: link})
	if !strings.Contains(message.HTML, `href="`+link+`"`) || !strings.Contains(message.HTML, "Verify email address") || !strings.Contains(message.HTML, `target="_self"`) || strings.Contains(message.HTML, "<script>") {
		t.Fatal("unsafe or missing verification button")
	}
	if !strings.Contains(message.Text, link) {
		t.Fatal("plain-text alternative missing")
	}
}

func TestReminder_IsInTheClientsLanguage(t *testing.T) {
	d := email.Data{FirstName: "Rina", Start: time.Date(2026, 3, 16, 14, 0, 0, 0, wib.Zone), Psychologist: "Ayu Lestari", Place: "BSD (Tangerang)", Link: "https://x.test/b"}

	id := email.Render("id", email.Reminder, d)
	en := email.Render("en", email.Reminder, d)

	if !strings.Contains(id.Text, "Senin, 16 Maret 2026") || !strings.Contains(id.Text, "14.00 WIB") {
		t.Fatalf("Indonesian date/time missing:\n%s", id.Text)
	}
	if !strings.Contains(en.Text, "Monday, 16 March 2026") || !strings.Contains(en.Text, "14:00 WIB") {
		t.Fatalf("English date/time missing:\n%s", en.Text)
	}
	if !strings.Contains(en.Text, "Ayu Lestari") || !strings.Contains(en.Text, "BSD (Tangerang)") {
		t.Fatalf("psychologist or place missing:\n%s", en.Text)
	}
}

func TestUnknownLocale_FallsBackToIndonesian(t *testing.T) {
	got := email.Render("fr", email.VerifyEmail, email.Data{FirstName: "Rina", Link: "https://x.test/v"})
	want := email.Render("id", email.VerifyEmail, email.Data{FirstName: "Rina", Link: "https://x.test/v"})
	if got != want {
		t.Fatal("unknown locale did not fall back to id")
	}
}

func TestNoEmailCanMentionTheService(t *testing.T) {
	// Data has no service field at all; this guards against one being added
	// to a template by hand.
	for _, k := range email.AllKinds {
		for _, loc := range []string{"id", "en"} {
			body := email.Template(loc, k)
			for _, banned := range []string{".Service", "{{.Reason", "counsel", "konseling"} {
				if strings.Contains(body, banned) {
					t.Errorf("%s/%s mentions %q", loc, k, banned)
				}
			}
		}
	}
}
