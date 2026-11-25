package app

import (
	"careconnect/internal/domain/wib"
	"careconnect/internal/platform/mail"
	"careconnect/internal/store"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/url"
	"slices"
	"strings"
	"time"
)

// These boundaries match the existing booking time picker: before noon, noon–17:00, after 17:00 (WIB).
type WaitingPeriod struct {
	Key  string `json:"key"`
	From int    `json:"from"`
	To   int    `json:"to"`
}

var WaitingPeriods = []WaitingPeriod{{"morning", 0, 720}, {"afternoon", 720, 1020}, {"evening", 1020, 1440}}

func (a *App) WaitingOptions(ctx context.Context) (map[string]any, error) {
	st, err := a.store.Settings(ctx)
	if err != nil {
		return nil, err
	}
	lead := max(st.MinLead, 24*time.Hour)
	return map[string]any{"periods": WaitingPeriods, "minDate": a.clock.Now().Add(lead).In(wib.Zone).Format(time.DateOnly), "minLeadHours": int(lead.Hours()), "maxRangeDays": 31}, nil
}
func (a *App) JoinWaiting(ctx context.Context, act Actor, r store.WaitingRequest) (store.WaitingRequest, error) {
	if act.Role != "client" {
		return r, ErrForbidden
	}
	r.ClientID = act.ClientID
	from, err := time.ParseInLocation(time.DateOnly, r.Date, wib.Zone)
	if err != nil {
		return r, ErrBadRequest
	}
	if r.DateEnd == "" {
		r.DateEnd = r.Date
	}
	end, err := time.ParseInLocation(time.DateOnly, r.DateEnd, wib.Zone)
	if err != nil || end.Before(from) || end.Sub(from) > 30*24*time.Hour {
		return r, ErrBadRequest
	}
	options, err := a.WaitingOptions(ctx)
	if err != nil {
		return r, err
	}
	if r.Date < options["minDate"].(string) {
		return r, ErrBadRequest
	}
	slices.SortFunc(r.Periods, func(a, b string) int {
		rank := map[string]int{"morning": 0, "afternoon": 1, "evening": 2}
		return rank[a] - rank[b]
	})
	r.Periods = slices.Compact(r.Periods)
	if len(r.Periods) == 0 || len(r.Periods) > 3 {
		return r, ErrBadRequest
	}
	for _, p := range r.Periods {
		if !oneOf(p, "morning", "afternoon", "evening") {
			return r, ErrBadRequest
		}
	}
	if !oneOf(r.SessionType, "chat", "voice", "video", "in_person") || (r.SessionType == "in_person") != (r.LocationID != "") {
		return r, ErrBadRequest
	}
	if r.PsychologistID != "" && !isUUID(r.PsychologistID) {
		return r, ErrBadRequest
	}
	psychs, err := a.store.SearchPsychologists(ctx, store.PsychologistFilter{})
	if err != nil {
		return r, err
	}
	eligible := false
	for _, p := range psychs {
		if (r.PsychologistID == "" || r.PsychologistID == p.ID) && slices.Contains(p.ServiceIDs, r.ServiceID) && slices.Contains(p.SessionTypes, r.SessionType) && (r.SessionType != "in_person" || slices.Contains(p.LocationIDs, r.LocationID)) {
			eligible = true
			break
		}
	}
	if !eligible {
		return r, ErrBadRequest
	}
	svc, err := a.store.GetService(ctx, r.ServiceID)
	if err != nil || !svc.Active {
		return r, ErrBadRequest
	}
	existing, err := a.store.WaitingRequests(ctx, act.ClientID, true)
	if err != nil {
		return r, err
	}
	if len(existing) >= 20 {
		return r, ErrBadRequest
	}
	canonical, _ := json.Marshal([]any{r.PsychologistID, r.ServiceID, r.Date, r.DateEnd, r.Periods, r.SessionType, r.LocationID})
	r.Key = fmt.Sprintf("%x", sha256.Sum256(canonical))
	r.CreatedAt = a.clock.Now()
	r.UpdatedAt = r.CreatedAt
	r, err = a.store.CreateWaiting(ctx, r)
	if err == nil {
		a.refreshWaiting(ctx)
	}
	return r, err
}
func (a *App) MyWaiting(ctx context.Context, act Actor) ([]store.WaitingRequest, error) {
	if act.Role != "client" {
		return nil, ErrForbidden
	}
	return a.store.WaitingRequests(ctx, act.ClientID, false)
}
func (a *App) RemoveWaiting(ctx context.Context, act Actor, id string) error {
	if act.Role != "client" {
		return ErrForbidden
	}
	return a.store.RemoveWaiting(ctx, act.ClientID, id, a.clock.Now())
}
func (a *App) refreshWaiting(ctx context.Context) {
	if err := a.runWaitingList(ctx, false); err != nil {
		a.log.Error("waiting list refresh", "err", err)
	}
}

// One global advisory lock covers matching and email delivery across overlapping worker runs.
func (a *App) RunWaitingList(ctx context.Context) error { return a.runWaitingList(ctx, true) }
func (a *App) runWaitingList(ctx context.Context, deliver bool) error {
	return a.store.WithWaitingLock(ctx, func() error {
		requests, err := a.store.WaitingRequests(ctx, "", true)
		if err != nil {
			return err
		}
		if len(requests) == 0 {
			return nil
		}
		psychs, err := a.store.SearchPsychologists(ctx, store.PsychologistFilter{})
		if err != nil {
			return err
		}
		settings, err := a.store.Settings(ctx)
		if err != nil {
			return err
		}
		notBefore := a.clock.Now().Add(max(settings.MinLead, 24*time.Hour))
		for _, r := range requests {
			found := map[string]store.WaitingSlot{}
			from, _ := time.ParseInLocation(time.DateOnly, r.Date, wib.Zone)
			end, _ := time.ParseInLocation(time.DateOnly, r.DateEnd, wib.Zone)
			days := int(end.Sub(from).Hours()/24) + 1
			for _, p := range psychs {
				if (r.PsychologistID != "" && r.PsychologistID != p.ID) || !slices.Contains(p.ServiceIDs, r.ServiceID) || !slices.Contains(p.SessionTypes, r.SessionType) || (r.SessionType == "in_person" && !slices.Contains(p.LocationIDs, r.LocationID)) {
					continue
				}
				mode := "online"
				if r.SessionType == "in_person" {
					mode = "in_person"
				}
				slots, err := a.Slots(ctx, SlotQuery{PsychologistID: p.ID, ServiceID: r.ServiceID, From: from, Days: days, Mode: mode, LocationID: r.LocationID})
				if err != nil {
					return err
				}
				for _, day := range slots {
					for _, slot := range day.Slots {
						if slot.Start.Before(notBefore) {
							continue
						}
						minute := slot.Start.In(wib.Zone).Hour()*60 + slot.Start.In(wib.Zone).Minute()
						matched := false
						for _, period := range WaitingPeriods {
							if minute >= period.From && minute < period.To && slices.Contains(r.Periods, period.Key) {
								matched = true
							}
						}
						if !matched {
							continue
						}
						q := url.Values{"service": {r.ServiceID}, "sessionType": {r.SessionType}, "start": {slot.Start.Format(time.RFC3339)}}
						if r.LocationID != "" {
							q.Set("location", r.LocationID)
						}
						key := p.ID + "|" + slot.Start.UTC().Format(time.RFC3339)
						found[key] = store.WaitingSlot{PsychologistID: p.ID, PsychologistName: p.Name, Start: slot.Start, SessionType: r.SessionType, LocationID: r.LocationID, LocationName: r.LocationName, ServiceID: r.ServiceID, Link: "/psychologists/" + p.ID + "?" + q.Encode()}
					}
				}
			}
			if err = a.store.WaitingSnapshot(ctx, r, found, a.clock.Now()); err != nil {
				return err
			}
		}
		if !deliver {
			return nil
		}
		deliveries, err := a.store.WaitingDeliveries(ctx, notBefore)
		if err != nil {
			return err
		}
		for _, d := range deliveries {
			v := d.Details
			title := "A session matching your preferences is now available!"
			action := "View Available Slot"
			disclaimer := "This is not a reservation. Availability may change; book the session to confirm it. Your existing bookings have not changed."
			if d.Locale == "id" {
				title = "Sesi yang sesuai preferensi Anda kini tersedia!"
				action = "Lihat Sesi Tersedia"
				disclaimer = "Ini bukan reservasi. Ketersediaan dapat berubah; pesan sesi untuk mengonfirmasi. Pemesanan Anda yang lain tidak berubah."
			}
			label := map[string]string{"chat": "Chat", "voice": "Voice call", "video": "Video call", "in_person": "In-person"}[v.SessionType]
			text := strings.Join([]string{title, "", v.PsychologistName, v.Start.In(wib.Zone).Format("Monday, 2 January 2006 · 15:04 WIB"), label + " " + v.LocationName, "", action + ": " + a.base + v.Link, "", disclaimer}, "\n")
			if err = a.mail.Send(ctx, mail.Email{To: d.Email, Subject: title, Text: text}); err != nil {
				a.log.Error("waiting notification delivery", "err", err)
				continue
			}
			if err = a.store.WaitingDeliverySent(ctx, d.ID, a.clock.Now()); err != nil {
				return err
			}
		}
		return nil
	})
}
func (a *App) FulfillWaiting(ctx context.Context, act Actor, id string) error {
	if act.Role != "client" {
		return ErrForbidden
	}
	return a.store.FulfillWaiting(ctx, act.ClientID, id, a.clock.Now())
}
