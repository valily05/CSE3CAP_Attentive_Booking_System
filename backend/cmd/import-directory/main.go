// Import public profile facts into the local directory. Never import login accounts or working hours.
package main

import (
	"careconnect/internal/store"
	"context"
	"encoding/json"
	"fmt"
	"github.com/jackc/pgx/v5"
	"log"
	"os"
	"strconv"
	"strings"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
func run() error {
	ctx := context.Background()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://careconnect:careconnect@localhost:5433/careconnect?sslmode=disable"
	}
	st, err := store.Open(ctx, url)
	if err != nil {
		return err
	}
	defer st.Close()
	if err = st.Migrate(ctx); err != nil {
		return err
	}
	raw, err := os.ReadFile("../frontend/src/data/attentive-catalog.json")
	if err != nil {
		return err
	}
	var cat struct {
		Services []struct {
			ID, Name, NameEn, CategoryID, DurationEn string
			Audience, Modes                          []string
		}
		Providers []struct {
			ID, Name, TitleEn, PhotoURL, Experience string
			Active                                  bool
			ServiceIDs, BranchIDs, Specialties      []string
		}
	}
	if err = json.Unmarshal(raw, &cat); err != nil {
		return err
	}
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		return err
	}
	defer conn.Close(ctx)
	tx, err := conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	allowed := map[string]bool{}
	modes := map[string][]string{}
	for _, s := range cat.Services {
		if s.CategoryID != "c-konseling" && s.CategoryID != "c-akademik" {
			continue
		}
		allowed[s.ID] = true
		modes[s.ID] = s.Modes
		age := "adult"
		if strings.Contains(s.ID, "anak") || strings.Contains(s.ID, "pendidikan") {
			age = "child_teen"
		}
		if strings.Contains(s.ID, "couple") || strings.Contains(s.ID, "family") || strings.Contains(s.ID, "enrich") {
			age = "family_couple"
		}
		minutes := 60
		if s.ID == "p-brainspotting" {
			minutes = 90
		}
		if s.ID == "p-home-visit" || s.ID == "p-visit-anak" {
			minutes = 120
		}
		_, err = tx.Exec(ctx, "INSERT INTO service(id,name,name_id,category_id,duration_note,length_minutes,age_group) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,name_id=EXCLUDED.name_id,category_id=EXCLUDED.category_id,duration_note=EXCLUDED.duration_note", s.ID, s.NameEn, s.Name, s.CategoryID, s.DurationEn, minutes, age)
		if err != nil {
			return err
		}
	}
	areaRaw, err := os.ReadFile("../frontend/src/data/attentive-experience-areas.json")
	if err != nil {
		return err
	}
	var experienceAreas struct {
		Profiles []struct {
			SourceID string
			AreaIDs  []string
		}
	}
	if err = json.Unmarshal(areaRaw, &experienceAreas); err != nil {
		return err
	}
	areaMap := map[string][]string{}
	for _, profile := range experienceAreas.Profiles {
		if profile.SourceID != "" {
			areaMap[profile.SourceID] = profile.AreaIDs
		}
	}
	count := 0
	for _, p := range cat.Providers {
		if !p.Active {
			continue
		}
		meta := map[string]any{"sourceId": p.ID, "experienceLabel": strings.ReplaceAll(p.Experience, "Tahun", "years")}
		text := strings.TrimSpace(strings.TrimLeft(p.Experience, ">=≥ "))
		if fields := strings.Fields(text); len(fields) > 0 {
			if years, e := strconv.Atoi(fields[0]); e == nil {
				meta["experienceMinYears"] = years
			}
		}
		meta["areasOfExperience"] = areaMap[p.ID]
		data, _ := json.Marshal(meta)
		online, offline := false, false
		for _, id := range p.ServiceIDs {
			for _, m := range modes[id] {
				online = online || m == "Online"
				offline = offline || m == "Offline"
			}
		}
		types := []string{}
		if online {
			types = append(types, "video")
		}
		if offline {
			types = append(types, "in_person")
		}
		var id string
		err = tx.QueryRow(ctx, "INSERT INTO psychologist(id,name,title,specialty,photo_url,session_types,directory_metadata) VALUES(md5('attentive-directory:'||$1)::uuid,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,title=EXCLUDED.title,specialty=EXCLUDED.specialty,photo_url=EXCLUDED.photo_url,directory_metadata=EXCLUDED.directory_metadata RETURNING id", p.ID, p.Name, p.TitleEn, strings.Join(p.Specialties, ", "), p.PhotoURL, types, data).Scan(&id)
		if err != nil {
			return err
		}
		for _, svc := range p.ServiceIDs {
			if allowed[svc] {
				if _, err = tx.Exec(ctx, "INSERT INTO psychologist_service VALUES($1,$2) ON CONFLICT DO NOTHING", id, svc); err != nil {
					return err
				}
			}
		}
		branches := map[string]string{"b-tbi": "jakarta", "b-bsd": "bsd", "b-malang": "malang"}
		for _, branch := range p.BranchIDs {
			if loc, ok := branches[branch]; ok {
				if _, err = tx.Exec(ctx, "INSERT INTO psychologist_location SELECT $1,id FROM location WHERE id=$2 ON CONFLICT DO NOTHING", id, loc); err != nil {
					return err
				}
			}
		}
		count++
	}
	raw, err = os.ReadFile("../frontend/src/data/demo-profile-metadata.json")
	if err != nil {
		return err
	}
	var demo map[string]struct{ Name, Gender string }
	if err = json.Unmarshal(raw, &demo); err != nil {
		return err
	}
	for id, p := range demo {
		if strings.HasPrefix(p.Name, "Budi ") {
			p.Gender = "male"
		}
		if strings.HasPrefix(p.Name, "Citra ") {
			p.Gender = "female"
		}
		data, _ := json.Marshal(map[string]any{"gender": p.Gender})
		if _, err = tx.Exec(ctx, "UPDATE psychologist SET directory_metadata=directory_metadata || $3::jsonb WHERE id=$1 AND name=$2", id, p.Name, data); err != nil {
			return err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	fmt.Printf("Imported %d active profiles and %d services; no schedules or accounts created.\n", count, len(allowed))
	return nil
}
