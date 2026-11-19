package httpapi_test

import (
	"context"
	"net/http"
	"slices"
	"testing"
	"time"

	"careconnect/internal/domain/schedule"
	"careconnect/internal/domain/wib"

	"careconnect/internal/httpapi/apitest"
	"careconnect/internal/store"
)

type card struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	LocationIDs []string `json:"locationIds"`
}

func TestPsychologists_PublicSearchMatchesAllThreeFilters(t *testing.T) {
	e := apitest.New(t)
	e.SeedCatalog()
	e.SeedPsychologist(store.NewPsychologist{Name: "Match", SessionTypes: []string{"in_person"}, LocationIDs: []string{"bsd"}, ServiceIDs: []string{"child-90"}})
	e.SeedPsychologist(store.NewPsychologist{Name: "Jakarta only", SessionTypes: []string{"in_person"}, LocationIDs: []string{"jakarta"}, ServiceIDs: []string{"child-90"}})
	e.SeedPsychologist(store.NewPsychologist{Name: "Adults", SessionTypes: []string{"in_person"}, LocationIDs: []string{"bsd"}, ServiceIDs: []string{"adult-60"}})

	var got struct {
		Psychologists []card `json:"psychologists"`
	}
	status := e.Client().Do("GET", "/api/psychologists?ageGroup=child_teen&mode=in_person&location=bsd", nil, &got)

	if status != http.StatusOK || len(got.Psychologists) != 1 || got.Psychologists[0].Name != "Match" {
		t.Fatalf("search = %d %+v", status, got)
	}
}

func TestCatalog_ListsLocationsAndServicesForFilters(t *testing.T) {
	e := apitest.New(t)
	e.SeedCatalog()
	var got struct {
		Locations []store.Location `json:"locations"`
		Services  []store.Service  `json:"services"`
	}
	if s := e.Client().Do("GET", "/api/catalog", nil, &got); s != http.StatusOK || len(got.Locations) != 3 || len(got.Services) != 3 {
		t.Fatalf("catalog = %d %+v", s, got)
	}
}

func TestPsychologists_UnknownFilterValueIsABadRequest(t *testing.T) {
	e := apitest.New(t)
	if s := e.Client().Do("GET", "/api/psychologists?mode=teleport", nil, nil); s != http.StatusBadRequest {
		t.Fatalf("bad mode = %d", s)
	}
}

type slotsResponse struct {
	Days []struct {
		Date  string `json:"date"`
		Slots []struct {
			Start      time.Time `json:"start"`
			Mode       string    `json:"mode"`
			LocationID string    `json:"locationId"`
		} `json:"slots"`
	} `json:"days"`
}

func (r slotsResponse) starts() map[string][]string {
	out := map[string][]string{}
	for _, d := range r.Days {
		out[d.Date] = []string{}
		for _, s := range d.Slots {
			out[d.Date] = append(out[d.Date], s.Start.In(wib.Zone).Format("15:04"))
		}
	}
	return out
}

func mondayOnlinePsych(e *apitest.Env) string {
	id := e.SeedPsychologist(store.NewPsychologist{Name: "Ayu", SessionTypes: []string{"video", "in_person"}, LocationIDs: []string{"bsd"}, ServiceIDs: []string{"adult-60"}})
	if err := e.Store.SetWeeklyHours(context.Background(), id, []schedule.WeeklyHours{
		{Weekday: time.Monday, Start: schedule.HM(9, 0), End: schedule.HM(13, 0), Mode: schedule.Online},
		{Weekday: time.Tuesday, Start: schedule.HM(9, 0), End: schedule.HM(11, 0), Mode: schedule.InPerson, LocationID: "bsd"},
	}); err != nil {
		panic(err)
	}
	return id
}

func TestSlots_ListsEachDayAndRespectsTheOneDayLead(t *testing.T) {
	e := apitest.New(t) // now: Monday 2 March 09:00 WIB
	e.SeedCatalog()
	id := mondayOnlinePsych(e)

	var got slotsResponse
	status := e.Client().Do("GET", "/api/psychologists/"+id+"/slots?service=adult-60&from=2026-03-02&days=8", nil, &got)
	if status != http.StatusOK {
		t.Fatalf("slots = %d", status)
	}
	s := got.starts()
	if len(got.Days) != 8 {
		t.Fatalf("days = %d, want 8", len(got.Days))
	}
	if len(s["2026-03-02"]) != 0 {
		t.Fatalf("today offered %v despite 24h lead", s["2026-03-02"])
	}
	if want := []string{"09:00"}; !slices.Equal(s["2026-03-03"], want) { // Tue 09:00 is exactly 24h ahead; 10:15 would overrun 11:00
		t.Fatalf("Tuesday = %v, want %v", s["2026-03-03"], want)
	}
	if want := []string{"09:00", "10:15", "11:30"}; !slices.Equal(s["2026-03-09"], want) {
		t.Fatalf("next Monday = %v, want %v", s["2026-03-09"], want)
	}
}

func TestSlots_FilterBySessionTypeAndPlace(t *testing.T) {
	e := apitest.New(t)
	e.SeedCatalog()
	id := mondayOnlinePsych(e)

	var got slotsResponse
	e.Client().Do("GET", "/api/psychologists/"+id+"/slots?service=adult-60&from=2026-03-02&days=8&mode=in_person&location=bsd", nil, &got)
	for date, starts := range got.starts() {
		if date != "2026-03-03" && len(starts) > 0 {
			t.Fatalf("%s has online slots %v under an in-person filter", date, starts)
		}
	}
}

func TestSlots_ServiceThePsychologistDoesNotOffer(t *testing.T) {
	e := apitest.New(t)
	e.SeedCatalog()
	id := mondayOnlinePsych(e)
	var body apitest.ErrorBody
	if s := e.Client().Do("GET", "/api/psychologists/"+id+"/slots?service=family-120&from=2026-03-02&days=7", nil, &body); s != http.StatusUnprocessableEntity || body.Error != "service_not_offered" {
		t.Fatalf("got %d %q", s, body.Error)
	}
}

func TestPsychologists_CardShowsNextOpenTime(t *testing.T) {
	e := apitest.New(t)
	e.SeedCatalog()
	mondayOnlinePsych(e)

	var got struct {
		Psychologists []struct {
			NextOpen *time.Time `json:"nextOpen"`
		} `json:"psychologists"`
	}
	e.Client().Do("GET", "/api/psychologists", nil, &got)
	want := time.Date(2026, 3, 3, 9, 0, 0, 0, wib.Zone)
	if len(got.Psychologists) != 1 || got.Psychologists[0].NextOpen == nil || !got.Psychologists[0].NextOpen.Equal(want) {
		t.Fatalf("nextOpen = %+v, want %v", got.Psychologists, want)
	}
}

func TestPsychologist_ProfileIncludesNextOpenTime(t *testing.T) {
	e := apitest.New(t)
	e.SeedCatalog()
	id := mondayOnlinePsych(e)

	var got struct {
		Name     string     `json:"name"`
		NextOpen *time.Time `json:"nextOpen"`
	}
	if s := e.Client().Do("GET", "/api/psychologists/"+id, nil, &got); s != http.StatusOK {
		t.Fatalf("profile = %d", s)
	}
	want := time.Date(2026, 3, 3, 9, 0, 0, 0, wib.Zone)
	if got.Name != "Ayu" || got.NextOpen == nil || !got.NextOpen.Equal(want) {
		t.Fatalf("profile = %+v, want nextOpen %v", got, want)
	}
}

func TestPsychologists_CardShowsOpenTimesForTheNextSevenDays(t *testing.T) {
	e := apitest.New(t) // now: Monday 2 March 09:00 WIB
	e.SeedCatalog()
	mondayOnlinePsych(e) // Mondays online 09-13 (3 slots), Tuesdays BSD 09-11 (1 slot)

	var got struct {
		Psychologists []struct {
			Week []struct {
				Date  string `json:"date"`
				Count int    `json:"count"`
			} `json:"week"`
		} `json:"psychologists"`
	}
	e.Client().Do("GET", "/api/psychologists", nil, &got)

	week := got.Psychologists[0].Week
	want := map[string]int{"2026-03-03": 1, "2026-03-04": 0, "2026-03-08": 0, "2026-03-09": 3}
	if len(week) != 7 || week[0].Date != "2026-03-03" || week[6].Date != "2026-03-09" {
		t.Fatalf("week = %+v, want 7 days from tomorrow", week)
	}
	for _, d := range week {
		if w, ok := want[d.Date]; ok && d.Count != w {
			t.Fatalf("%s count = %d, want %d", d.Date, d.Count, w)
		}
	}
}
