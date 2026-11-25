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
	htmltemplate "html/template"
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
	message := mail.Email{
		Subject: run(c[string(k)+".subject"], v),
		Text:    run(c[string(k)+".body"], v) + "\n\n" + c["signature"],
	}
	if k == VerifyEmail {
		const layout = `<!doctype html><html><body style="margin:0;background:#f8f4ee;font-family:Arial,sans-serif;color:#14284b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:36px 16px"><table role="presentation" width="100%" style="max-width:560px;border:1px solid #e5dccd;border-radius:20px;overflow:hidden;background:#fff" cellspacing="0" cellpadding="0"><tr><td style="padding:30px 36px;background:#14284b;color:#fff;font-size:30px;font-family:Georgia,serif;font-weight:bold">attentive<span style="color:#d6a74d">.</span></td></tr><tr><td style="padding:36px"><p style="font-size:12px;letter-spacing:2px;color:#8c641f">{{.Eyebrow}}</p><h1 style="font-size:28px;line-height:1.25;margin:16px 0">{{.Title}}</h1><p style="font-size:16px;line-height:1.7">{{.Greeting}} {{.Name}},</p><p style="font-size:16px;line-height:1.7;color:#526078">{{.Body}}</p><table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0"><tr><td bgcolor="#d6a74d" style="border-radius:9px"><a href="{{.Link}}" target="_self" style="display:inline-block;padding:17px 30px;font-size:16px;font-weight:bold;text-decoration:none;color:#14284b">{{.Button}}</a></td></tr></table><p style="font-size:14px;line-height:1.7;color:#647084">{{.Expiry}}</p><hr style="border:0;border-top:1px solid #ebe4d9;margin:28px 0"><p style="font-size:13px;line-height:1.7;color:#647084">{{.Ignore}}</p><p style="font-size:14px;line-height:1.6">{{.Signoff}}</p></td></tr></table></td></tr></table></body></html>`
		values := map[string]string{"Eyebrow": c["verification.eyebrow"], "Title": c["verification.title"], "Greeting": c["verification.greeting"], "Name": d.FirstName, "Body": c["verification.body"], "Button": c["verification.button"], "Expiry": c["verification.expiry"], "Ignore": c["verification.ignore"], "Signoff": c["verification.signoff"], "Link": d.Link}
		var body bytes.Buffer
		if err := htmltemplate.Must(htmltemplate.New("verification").Parse(layout)).Execute(&body, values); err != nil {
			panic(err)
		}
		message.HTML = body.String()
	}
	return message
}
