// Package mail sends email. Brevo, Mailgun and SendGrid all accept SMTP, so
// one SMTP sender covers them (and Mailpit in development).
package mail

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"mime"
	"mime/multipart"
	netmail "net/mail"
	"net/smtp"
	"net/textproto"
	"strings"
	"sync"
)

// Email is one outgoing message.
type Email struct {
	To      string
	Subject string
	Text    string
	HTML    string
}

// Sender sends email.
type Sender interface {
	Send(ctx context.Context, e Email) error
}

// SMTP sends through an SMTP relay. Credentials come from the environment,
// never from code (Scope §13).
type SMTP struct {
	Addr, From, User, Password string
}

// ErrHeaderInjection means a recipient or subject tried to add headers.
var ErrHeaderInjection = errors.New("line break in an email header")

// envelopeFrom turns `Name <addr>` into the bare address SMTP's MAIL FROM needs.
func envelopeFrom(from string) (string, error) {
	a, err := netmail.ParseAddress(from)
	if err != nil {
		return "", fmt.Errorf("SMTP_FROM: %w", err)
	}
	return a.Address, nil
}

// Send delivers e.
func (s SMTP) Send(_ context.Context, e Email) error {
	if strings.ContainsAny(e.To+e.Subject, "\r\n") {
		return ErrHeaderInjection
	}
	sender, err := envelopeFrom(s.From)
	if err != nil {
		return err
	}
	var a smtp.Auth
	if s.User != "" {
		host, _, _ := strings.Cut(s.Addr, ":")
		a = smtp.PlainAuth("", s.User, s.Password, host)
	}
	msg := "From: " + s.From + "\r\nTo: " + e.To + "\r\nSubject: " + mime.QEncoding.Encode("utf-8", e.Subject) +
		"\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n" + e.Text
	if e.HTML != "" {
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		for _, part := range []struct{ kind, content string }{{"text/plain", e.Text}, {"text/html", e.HTML}} {
			h := textproto.MIMEHeader{}
			h.Set("Content-Type", part.kind+"; charset=UTF-8")
			p, err := writer.CreatePart(h)
			if err != nil {
				return err
			}
			if _, err = p.Write([]byte(part.content)); err != nil {
				return err
			}
		}
		if err := writer.Close(); err != nil {
			return err
		}
		msg = "From: " + s.From + "\r\nTo: " + e.To + "\r\nSubject: " + mime.QEncoding.Encode("utf-8", e.Subject) + "\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=\"" + writer.Boundary() + "\"\r\n\r\n" + body.String()
	}
	if err := smtp.SendMail(s.Addr, a, sender, []string{e.To}, []byte(msg)); err != nil {
		return fmt.Errorf("send mail: %w", err)
	}
	return nil
}

// Recorder keeps emails in memory instead of sending them (tests, demos).
type Recorder struct {
	mu   sync.Mutex
	sent []Email
}

// Send records e.
func (r *Recorder) Send(_ context.Context, e Email) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sent = append(r.sent, e)
	return nil
}

// Sent returns a copy of everything recorded.
func (r *Recorder) Sent() []Email {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]Email(nil), r.sent...)
}

// To returns emails sent to addr.
func (r *Recorder) To(addr string) []Email {
	var out []Email
	for _, e := range r.Sent() {
		if strings.EqualFold(e.To, addr) {
			out = append(out, e)
		}
	}
	return out
}
