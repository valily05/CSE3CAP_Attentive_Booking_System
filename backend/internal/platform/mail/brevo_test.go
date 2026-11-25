package mail

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestBrevoSendsTransactionalPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.Header.Get("api-key") != "test-key" || r.Header.Get("Content-Type") != "application/json" {
			t.Error("incorrect Brevo request")
		}
		var body struct {
			Sender      struct{ Email, Name string }
			To          []struct{ Email string }
			Subject     string
			TextContent string
			HTMLContent string
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body.Sender.Email != "sender@example.test" || body.Sender.Name != "Attentive" || len(body.To) != 1 || body.To[0].Email != "client@example.test" || body.Subject != "Verify your email" || !strings.Contains(body.TextContent, "/verify?token=") || !strings.Contains(body.HTMLContent, "Verify email") {
			t.Errorf("incorrect email body: %+v", body)
		}
		w.WriteHeader(201)
		_, _ = w.Write([]byte(`{"messageId":"test-id"}`))
	}))
	defer server.Close()
	s := Brevo{APIKey: "test-key", FromEmail: "sender@example.test", FromName: "Attentive", endpoint: server.URL}
	if err := s.Send(context.Background(), Email{To: "client@example.test", Subject: "Verify your email", Text: "https://example.test/verify?token=secret", HTML: `<a href="https://example.test/verify?token=secret">Verify email</a>`}); err != nil {
		t.Fatal(err)
	}
}

func TestBrevoRejectsProviderFailuresWithoutLeakingBody(t *testing.T) {
	for _, status := range []int{400, 401, 429, 500, 302} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(status)
				_, _ = w.Write([]byte(`{"message":"private-provider-details"}`))
			}))
			defer server.Close()
			s := Brevo{APIKey: "test-key", FromEmail: "sender@example.test", endpoint: server.URL}
			err := s.Send(context.Background(), Email{To: "client@example.test", Subject: "Hello"})
			if err == nil || strings.Contains(err.Error(), "private-provider-details") || strings.Contains(err.Error(), "test-key") {
				t.Fatalf("unsafe or missing error: %v", err)
			}
		})
	}
}

func TestBrevoRequiresAcknowledgementAndHonorsCancellation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(201); _, _ = w.Write([]byte(`{}`)) }))
	defer server.Close()
	s := Brevo{APIKey: "test-key", FromEmail: "sender@example.test", endpoint: server.URL}
	if err := s.Send(context.Background(), Email{To: "client@example.test"}); err == nil {
		t.Fatal("missing acknowledgement accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := s.Send(ctx, Email{To: "client@example.test"}); err == nil {
		t.Fatal("cancelled request sent")
	}
	if err := s.Send(context.Background(), Email{To: "client@example.test\nBcc: other@example.test"}); err != ErrHeaderInjection {
		t.Fatal(err)
	}
}

func TestMailProviderConfiguration(t *testing.T) {
	cases := []struct {
		name   string
		values map[string]string
		want   string
		fail   bool
	}{
		{"development", nil, "smtp", false},
		{"auto brevo", map[string]string{"BREVO_API_KEY": "key", "BREVO_SENDER_EMAIL": "sender@example.test"}, "brevo", false},
		{"missing key", map[string]string{"MAIL_PROVIDER": "brevo", "BREVO_SENDER_EMAIL": "sender@example.test"}, "", true},
		{"missing sender", map[string]string{"MAIL_PROVIDER": "brevo", "BREVO_API_KEY": "key"}, "", true},
		{"unknown provider", map[string]string{"MAIL_PROVIDER": "other"}, "", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			sender, err := FromEnv(func(key string) string { return c.values[key] })
			if (err != nil) != c.fail {
				t.Fatal(err)
			}
			if err != nil {
				return
			}
			switch sender.(type) {
			case SMTP:
				if c.want != "smtp" {
					t.Fatal("wrong provider")
				}
			case Brevo:
				if c.want != "brevo" {
					t.Fatal("wrong provider")
				}
			default:
				t.Fatal("unknown sender")
			}
		})
	}
}
