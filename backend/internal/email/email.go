// Package email renders every message the system sends, in the client's
// language. Copy lives in messages/*.json, never in Go code.
//
// Privacy (Scope §13): Data has no field for the service, the reason for
// a visit or anything clinical, so no template can include them.
package email

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"text/template"
	"time"

	"careconnect/internal/domain/wib"
	"careconnect/internal/platform/mail"
)

// Kind names a message.
type Kind string

const (
	UrgentRecovery      Kind = "urgent_recovery"
	UrgentReceived      Kind = "urgent_received"
	ClientAccess        Kind = "client_access"
	VerifyEmail         Kind = "verify_email"
	ResetPassword       Kind = "reset_password"
	BookingConfirmed    Kind = "booking_confirmed"
	BookingChanged      Kind = "booking_changed"
	BookingCancelled    Kind = "booking_cancelled"
	Reminder            Kind = "reminder"
	FollowUp            Kind = "follow_up"
	StaffBookingChanged Kind = "staff_booking_changed"
)

// AllKinds lists every message kind.
var AllKinds = []Kind{VerifyEmail, ResetPassword, BookingConfirmed, BookingChanged, BookingCancelled, Reminder, FollowUp, StaffBookingChanged, UrgentRecovery, UrgentReceived, ClientAccess}

// Data fills a template.
type Data struct {
	FirstName       string
	Start           time.Time
	Psychologist    string
	Place           string // location name; empty means online
	Code            string
	Link            string
	AttendLink      string
	UnsubscribeLink string
}

//go:embed messages/*.json
var files embed.FS

const fallback = "id"

var catalogs = func() map[string]map[string]string {
	out := map[string]map[string]string{}
	for _, loc := range []string{"id", "en"} {
		raw, err := files.ReadFile("messages/" + loc + ".json")
		if err != nil {
			panic(err)
		}
		m := map[string]string{}
		if err := json.Unmarshal(raw, &m); err != nil {
			panic(fmt.Sprintf("email catalog %s: %v", loc, err))
		}
		out[loc] = m
	}
	return out
}()

// CatalogDiff lists keys present in one catalog but not another.
func CatalogDiff() []string {
	var out []string
	for a, ca := range catalogs {
		for b, cb := range catalogs {
			for k := range ca {
				if _, ok := cb[k]; !ok {
					out = append(out, fmt.Sprintf("%s has %q, %s does not", a, k, b))
				}
			}
		}
	}
	sort.Strings(out)
	return out
}

func catalog(locale string) map[string]string {
	if c, ok := catalogs[locale]; ok {
		return c
	}
	return catalogs[fallback]
}

// Template returns the raw body template (for tests and review).
func Template(locale string, k Kind) string { return catalog(locale)[string(k)+".body"] }

type view struct {
	Data
	Date, Time string
}

func run(src string, v any) string {
	t := template.Must(template.New("").Option("missingkey=error").Parse(src))
	var b bytes.Buffer
	if err := t.Execute(&b, v); err != nil {
		panic(err) // templates are fixed at build time and covered by tests
	}
	return b.String()
}

func formatDate(c map[string]string, t time.Time) string {
	t = t.In(wib.Zone)
	return run(c["dateFormat"], map[string]any{
		"Weekday": strings.Split(c["weekdays"], ",")[t.Weekday()],
		"Day":     t.Day(),
		"Month":   strings.Split(c["months"], ",")[t.Month()-1],
		"Year":    t.Year(),
	})
}

// Render builds the email for kind in locale (falling back to Indonesian).
func Render(locale string, k Kind, d Data) mail.Email {
	c := catalog(locale)
	v := view{Data: d}
	if !d.Start.IsZero() {
		v.Date = formatDate(c, d.Start)
		v.Time = d.Start.In(wib.Zone).Format("15"+c["timeSeparator"]+"04") + " WIB"
	}
	if v.Place == "" {
		v.Place = c["online"]
	}
	return mail.Email{
		Subject: run(c[string(k)+".subject"], v),
		Text:    run(c[string(k)+".body"], v) + "\n\n" + c["signature"],
	}
}
