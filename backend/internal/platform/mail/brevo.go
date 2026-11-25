package mail

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	netmail "net/mail"
	"strings"
	"time"
)

// Brevo delivers transactional email through the server-side Brevo REST API.
type Brevo struct {
	APIKey, FromEmail, FromName string
	Client                      *http.Client
	endpoint                    string // Only overridden by package tests, never by public input.
}

func (s Brevo) Send(ctx context.Context, e Email) error {
	if strings.TrimSpace(s.APIKey) == "" {
		return errors.New("BREVO_API_KEY is required")
	}
	if strings.ContainsAny(e.To+e.Subject+s.FromEmail+s.FromName, "\r\n") {
		return ErrHeaderInjection
	}
	from, err := netmail.ParseAddress(s.FromEmail)
	if err != nil || from.Address != s.FromEmail {
		return errors.New("BREVO_SENDER_EMAIL must be a valid email address")
	}
	to, err := netmail.ParseAddress(e.To)
	if err != nil || to.Address != e.To {
		return errors.New("invalid email recipient")
	}
	type address struct {
		Email string `json:"email"`
		Name  string `json:"name,omitempty"`
	}
	payload, err := json.Marshal(struct {
		Sender  address   `json:"sender"`
		To      []address `json:"to"`
		Subject string    `json:"subject"`
		Text    string    `json:"textContent"`
		HTML    string    `json:"htmlContent,omitempty"`
	}{address{from.Address, s.FromName}, []address{{Email: to.Address}}, e.Subject, e.Text, e.HTML})
	if err != nil {
		return err
	}
	endpoint := s.endpoint
	if endpoint == "" {
		endpoint = "https://api.brevo.com/v3/smtp/email"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("api-key", s.APIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	client := s.Client
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	response, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("brevo request failed: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated {
		// Provider bodies may contain contact details; do not include them in logs.
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 64*1024))
		return fmt.Errorf("brevo rejected email (HTTP %d)", response.StatusCode)
	}
	var accepted struct {
		MessageID string `json:"messageId"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 64*1024)).Decode(&accepted); err != nil || accepted.MessageID == "" {
		return errors.New("brevo returned no message ID")
	}
	return nil
}

// FromEnv chooses Brevo when requested or when its API key is configured.
// An incomplete Brevo configuration fails startup instead of falling back.
func FromEnv(getenv func(string) string) (Sender, error) {
	value := func(key, fallback string) string {
		if v := strings.TrimSpace(getenv(key)); v != "" {
			return v
		}
		return fallback
	}
	provider := strings.ToLower(value("MAIL_PROVIDER", ""))
	if provider == "" {
		if value("BREVO_API_KEY", "") != "" {
			provider = "brevo"
		} else {
			provider = "smtp"
		}
	}
	switch provider {
	case "brevo":
		key, from := value("BREVO_API_KEY", ""), value("BREVO_SENDER_EMAIL", "")
		if key == "" {
			return nil, errors.New("BREVO_API_KEY is required for MAIL_PROVIDER=brevo")
		}
		parsed, err := netmail.ParseAddress(from)
		if err != nil || parsed.Address != from || strings.ContainsAny(from, "\r\n") {
			return nil, errors.New("BREVO_SENDER_EMAIL must be configured with your verified sender address")
		}
		return Brevo{APIKey: key, FromEmail: from, FromName: value("BREVO_SENDER_NAME", "Attentive")}, nil
	case "smtp":
		return SMTP{Addr: value("SMTP_ADDR", "localhost:1025"), From: value("SMTP_FROM", "Attentive <no-reply@attentive.test>"), User: getenv("SMTP_USER"), Password: getenv("SMTP_PASSWORD")}, nil
	default:
		return nil, errors.New("MAIL_PROVIDER must be smtp or brevo")
	}
}
