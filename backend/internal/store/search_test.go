package store_test

import (
	"slices"
	"testing"

	"careconnect/internal/store"
	"careconnect/internal/store/storetest"
)

func TestSearchPsychologists_AllFiltersMustMatch(t *testing.T) {
	s := storetest.New(t)
	for _, l := range []store.Location{{ID: "jakarta", Name: "Jakarta"}, {ID: "bsd", Name: "BSD (Tangerang)"}} {
		must(t, s.UpsertLocation(ctx, l))
	}
	for _, sv := range []store.Service{
		{ID: "adult-60", Name: "Adult", LengthMinutes: 60, AgeGroup: "adult"},
		{ID: "child-90", Name: "Child & teen", LengthMinutes: 90, AgeGroup: "child_teen"},
	} {
		must(t, s.UpsertService(ctx, sv))
	}
	mk := func(name string, types, locs, svcs []string) string {
		id, err := s.CreatePsychologist(ctx, store.NewPsychologist{Name: name, SessionTypes: types, LocationIDs: locs, ServiceIDs: svcs})
		must(t, err)
		return id
	}
	mk("Match: child, in person, BSD", []string{"in_person", "video"}, []string{"bsd"}, []string{"child-90"})
	mk("Wrong place", []string{"in_person"}, []string{"jakarta"}, []string{"child-90"})
	mk("Online only", []string{"video", "chat"}, nil, []string{"child-90"})
	mk("Adults only", []string{"in_person"}, []string{"bsd"}, []string{"adult-60"})
	inactive := mk("Inactive", []string{"in_person"}, []string{"bsd"}, []string{"child-90"})
	must(t, s.SetPsychologistActive(ctx, inactive, false))

	got, err := s.SearchPsychologists(ctx, store.PsychologistFilter{AgeGroup: "child_teen", Mode: "in_person", LocationID: "bsd"})
	must(t, err)

	if names := names(got); !slices.Equal(names, []string{"Match: child, in person, BSD"}) {
		t.Fatalf("got %v", names)
	}
	if m := got[0]; !slices.Equal(m.LocationIDs, []string{"bsd"}) || !slices.Equal(m.ServiceIDs, []string{"child-90"}) {
		t.Fatalf("card data = %+v", m)
	}
}

func TestSearchPsychologists_NoFiltersListsEveryActivePsychologistByName(t *testing.T) {
	s := storetest.New(t)
	for _, n := range []string{"Citra", "Ayu", "Budi"} {
		_, err := s.CreatePsychologist(ctx, store.NewPsychologist{Name: n, SessionTypes: []string{"video"}})
		must(t, err)
	}
	got, err := s.SearchPsychologists(ctx, store.PsychologistFilter{})
	must(t, err)
	if n := names(got); !slices.Equal(n, []string{"Ayu", "Budi", "Citra"}) {
		t.Fatalf("got %v", n)
	}
}

func TestSearchPsychologists_OnlineMatchesAnyOnlineChannel(t *testing.T) {
	s := storetest.New(t)
	_, err := s.CreatePsychologist(ctx, store.NewPsychologist{Name: "Chat only", SessionTypes: []string{"chat"}})
	must(t, err)
	_, err = s.CreatePsychologist(ctx, store.NewPsychologist{Name: "In person only", SessionTypes: []string{"in_person"}})
	must(t, err)

	got, err := s.SearchPsychologists(ctx, store.PsychologistFilter{Mode: "online"})
	must(t, err)
	if n := names(got); !slices.Equal(n, []string{"Chat only"}) {
		t.Fatalf("got %v", n)
	}
}

func names(ps []store.PsychologistCard) []string {
	out := make([]string, len(ps))
	for i, p := range ps {
		out[i] = p.Name
	}
	return out
}
