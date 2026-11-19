package mail

import (
	"context"
	"errors"
	"testing"
)

func TestEnvelopeFrom_UsesTheBareAddress(t *testing.T) {
	got, err := envelopeFrom("Attentive <no-reply@attentive.test>")
	if err != nil || got != "no-reply@attentive.test" {
		t.Fatalf("envelopeFrom = %q, %v", got, err)
	}
	if got, _ := envelopeFrom("no-reply@attentive.test"); got != "no-reply@attentive.test" {
		t.Fatalf("plain address = %q", got)
	}
}

func TestSMTP_RefusesHeaderInjection(t *testing.T) {
	s := SMTP{Addr: "127.0.0.1:1", From: "a@b.test"} // never dialled
	for _, e := range []Email{
		{To: "x@y.test\r\nBcc: everyone@y.test", Subject: "hi", Text: "body"},
		{To: "x@y.test", Subject: "hi\r\nBcc: everyone@y.test", Text: "body"},
	} {
		if err := s.Send(context.Background(), e); !errors.Is(err, ErrHeaderInjection) {
			t.Fatalf("Send(%q) = %v, want ErrHeaderInjection", e.To+e.Subject, err)
		}
	}
}
