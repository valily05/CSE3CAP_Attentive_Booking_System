"use client";

import {ForwardArrow} from "@/components/ui/ForwardArrow";
import Link from "next/link";
import { Search, X, MapPin, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { ServiceMenu } from "./ServiceMenu";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { api, errorCode } from "@/lib/api";
import { useAppLocale } from "@/lib/i18n";
import type { AgeGroup, Catalog, Mode, Psychologist } from "@/lib/types";
import styles from "./PsychologistSearch.module.css";
import { matchesCondition, type Condition } from "@/lib/conditions";
import { ATTENTIVE_CATALOG, EXPERIENCE_AREAS, profileExperienceAreas, localDirectoryProfile, matchesPreferences, type Preferences } from "@/lib/directory";

type Filters = { ageGroup: "" | AgeGroup; mode: "" | Mode; location: string };
const NONE: Filters = { ageGroup: "", mode: "", location: "" };
const AGE_GROUPS: AgeGroup[] = ["adult", "child_teen", "family_couple"];
type Sort = "soonest" | "name";

type Props = { onCount?: (n: number) => void; reassurance?: ReactNode; condition?: Condition; includeOfficial?:boolean };

/** G09-2: filter buttons and a directory that shows who is free this week. */
export function PsychologistSearch({ onCount, reassurance, condition, includeOfficial=false }: Props) {
  const t = useTranslations();
  const locale = useAppLocale();
  const [catalog, setCatalog] = useState<Catalog>({ locations: [], services: [] });
  const [filters, setFilters] = useState<Filters>(NONE);
  const [nameSearch,setNameSearch]=useState("");
  const [experienceArea,setExperienceArea]=useState("");
  const [pageSize,setPageSize]=useState(5);
  const [paging,setPaging]=useState({key:"",page:1});
  const resultsBar=useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState<Sort>("soonest");
  const [results, setResults] = useState<Psychologist[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preferences,setPreferences]=useState<Preferences>({source:"local",service:"",gender:"",experience:""});
  const clear=()=>{setNameSearch("");setExperienceArea("");setFilters(NONE);setPreferences({source:"local",service:"",gender:"",experience:""});};

  useEffect(() => {
    api.get<Catalog>("/api/catalog").then(setCatalog, (e) => setError(errorCode(e)));
  }, []);

  useEffect(() => {
    let live = true;
    const q = new URLSearchParams();
    if (filters.ageGroup) q.set("ageGroup", filters.ageGroup);
    if (filters.mode) q.set("mode", filters.mode);
    if (filters.location) q.set("location", filters.location);
    const qs = q.toString();
    api.get<{ psychologists: Psychologist[] }>(`/api/psychologists${qs ? `?${qs}` : ""}`).then(
      (r) => {
        if (!live) return;
        setResults(r.psychologists);
        setError(null);
        if (!qs) onCount?.(r.psychologists.length);
      },
      (e) => live && setError(errorCode(e)),
    );
    return () => {
      live = false;
    };
  }, [filters, onCount]);

  const locationName = useMemo(() => new Map([...catalog.locations.map((l) => [l.id, l.name] as const),...ATTENTIVE_CATALOG.branches.map(b=>[`official:${b.id}`,b.name] as const)]), [catalog]);


  const selectedService=ATTENTIVE_CATALOG.services.find(s=>preferences.service===`local:${s.id}`);
  const selectedLocalService=catalog.services.find(s=>preferences.service===`local:${s.id}`);
  const sorted = useMemo(() => {
    if(selectedLocalService&&filters.ageGroup&&selectedLocalService.ageGroup!==filters.ageGroup)return [];
    if(selectedService&&filters.mode&&!selectedService.modes.includes(filters.mode==="online"?"Online":"Offline"))return [];
    const list = (results ?? []).map(localDirectoryProfile).filter(p=>(!condition || matchesCondition(p, condition))&&matchesPreferences(p,preferences)&&p.name.toLocaleLowerCase(locale).includes(nameSearch.trim().toLocaleLowerCase(locale))&&(!experienceArea||profileExperienceAreas(p).includes(experienceArea)));
    if (sort === "name") return list.sort((a, b) => a.name.localeCompare(b.name));
    return list.sort((a,b)=>Number(a.origin==="official")-Number(b.origin==="official")||(a.nextOpen ?? "9999").localeCompare(b.nextOpen ?? "9999") || a.name.localeCompare(b.name));
  }, [results, sort, condition,preferences,selectedService,filters.mode,filters.ageGroup,selectedLocalService,nameSearch,experienceArea,locale]);
  const pageCount=Math.max(1,Math.ceil(sorted.length/pageSize));
  const pagingKey=JSON.stringify([filters,preferences,nameSearch,experienceArea,sort,pageSize]);
  if(paging.key!==pagingKey)setPaging({key:pagingKey,page:1});
  const page=paging.key===pagingKey?Math.min(paging.page,pageCount):1;
  const visibleProfiles=sorted.slice((page-1)*pageSize,page*pageSize);
  const goToPage=(next:number)=>{setPaging({key:pagingKey,page:Math.max(1,Math.min(next,pageCount))});resultsBar.current?.scrollIntoView({block:"start"});};
  const pageNumbers=Array.from({length:pageCount},(_,i)=>i+1).filter(n=>n===1||n===pageCount||Math.abs(n-page)<=1);
  // Pressing a chosen button again clears that filter.
  const toggle = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => {
      const next = { ...f, [key]: f[key] === value ? "" : value };
      if (key === "mode" && next.mode === "online") next.location = "";
      return next;
    });
  const anyFilter = nameSearch||experienceArea||filters.ageGroup || filters.mode || filters.location||preferences.service||preferences.gender||preferences.experience||preferences.source!==("local");

  return (
    <div className={styles.search}>
      <section className={styles.filters} aria-label={t("directory.label")}>
        <div role="group" aria-labelledby="f-who" className={styles.group}>
          <span id="f-who" className={styles.groupLabel}>
            {t("filter.who")}
          </span>
          <div className={styles.buttons}>
            <button type="button" className={styles.filter} aria-pressed={!filters.ageGroup} onClick={()=>setFilters(f=>({...f,ageGroup:""}))}>{locale==="en"?"Everyone":"Semua"}</button>
            {AGE_GROUPS.map((g) => (
              <button key={g} type="button" className={styles.filter} aria-pressed={filters.ageGroup === g} onClick={() => toggle("ageGroup", g)}>
                {t(`ageGroupName.${g}`)}
              </button>
            ))}
          </div>
        </div>
        <div role="group" aria-labelledby="f-how" className={styles.group}>
          <span id="f-how" className={styles.groupLabel}>
            {t("filter.how")}
          </span>
          <div className={styles.buttons}>
            <button type="button" className={styles.filter} aria-pressed={filters.mode === "online"} onClick={() => toggle("mode", "online")}>
              {t("filter.online")}
            </button>
            <button type="button" className={styles.filter} aria-pressed={filters.mode === "in_person"} onClick={() => toggle("mode", "in_person")}>
              {t("filter.inPerson")}
            </button>
          </div>
        </div>
        {filters.mode !== "online" && (
          <div role="group" aria-labelledby="f-where" className={styles.group}>
            <span id="f-where" className={styles.groupLabel}>
              {t("filter.where")}
            </span>
            <div className={styles.buttons}>
              {catalog.locations.map((l) => (
                <button key={l.id} type="button" className={styles.filter} aria-pressed={filters.location === l.id} onClick={() => toggle("location", l.id)}>
                  {l.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={styles.advanced}>
          <ServiceMenu label={t("directory.serviceFilter")} allLabel={t("directory.allServices")} value={preferences.service} onChange={service=>setPreferences(p=>({...p,service}))} groups={["c-konseling","c-akademik"].map(category=>({label:locale==="en"?(category==="c-konseling"?"Counseling / Therapy":"Academic Consultation"):(category==="c-konseling"?"Konseling / Terapi":"Konsultasi Akademik"),options:catalog.services.filter(s=>(s.categoryId??"c-konseling")===category).map(s=>({value:`local:${s.id}`,label:locale==="id"?s.nameId||s.name:s.name,iconName:s.name}))})).filter(g=>g.options.length)}/>
          <ServiceMenu icons={false} label={t("directory.areaFilter")} allLabel={t("directory.allAreas")} value={experienceArea} onChange={setExperienceArea} groups={[{label:t("directory.individualConcerns"),options:EXPERIENCE_AREAS.slice().sort((a,b)=>(locale==="id"?a.idLabel:a.en).localeCompare(locale==="id"?b.idLabel:b.en,locale)).map(area=>({value:area.id,label:locale==="id"?area.idLabel:area.en,iconName:""}))}]}/>
          <label className={styles.selectField}><span>{t("directory.genderFilter")}</span><span className={styles.selectControl}><select value={preferences.gender} onChange={e=>setPreferences(p=>({...p,gender:e.target.value}))}><option value="">{t("directory.anyGender")}</option>{["female","male","non_binary","not_listed"].map(g=><option key={g} value={g}>{t(`directory.gender.${g}`)}</option>)}</select><ChevronDown size={17} aria-hidden="true"/></span></label>
          <div className={styles.experience} role="group" aria-label={t("directory.experienceFilter")}><span className={styles.groupLabel}>{locale==="en"?"Professional experience":"Pengalaman profesional"}</span><div className={styles.buttons}>{["","under3","3to6","7to9","10plus"].map((value,i)=><button className={styles.filter} type="button" key={value} aria-pressed={preferences.experience===value} onClick={()=>setPreferences(p=>({...p,experience:value}))}>{(locale==="en"?["Any experience level","Under 3 years","3–6 years","7–9 years","10+ years"]:["Semua pengalaman","Di bawah 3 tahun","3–6 tahun","7–9 tahun","10+ tahun"])[i]}</button>)}</div></div>
        </div>
        {anyFilter && (
          <button type="button" className={styles.clear} onClick={clear}>
            {t("directory.clear")}
          </button>
        )}
      </section>
      {reassurance}

      {error && (
        <p role="alert" className={styles.error}>
          {t(`errors.${error}`)}
        </p>
      )}

      <div className={styles.bar} ref={resultsBar}>
        {results !== null && (
          <p className={styles.count} aria-live="polite">
            {t(includeOfficial?"directory.professionalCount":"directory.count", { count: sorted.length })}
          </p>
        )}
        <div className={styles.nameSearch}><Search size={18} aria-hidden="true"/><input type="search" aria-label={t("directory.searchName")} placeholder={t("directory.searchName")} value={nameSearch} onChange={e=>setNameSearch(e.target.value)}/>{nameSearch&&<button type="button" aria-label={t("directory.clearName")} onClick={()=>setNameSearch("")}><X size={16} aria-hidden="true"/></button>}</div>
        <div className={styles.resultControls}>
        <label className={styles.sort}>
          {t("directory.sort")}
          <span className={styles.selectControl}><select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="soonest">{t("directory.sortSoonest")}</option>
            <option value="name">{t("directory.sortName")}</option>
          </select><ChevronDown size={17} aria-hidden="true"/></span>
        </label>
        <label className={styles.sort}>{t("directory.perPage")}<span className={styles.selectControl}><select value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>{[5,10,20].map(n=><option key={n} value={n}>{n}</option>)}</select><ChevronDown size={17} aria-hidden="true"/></span></label></div>
      </div>

      {results !== null && sorted.length === 0 && (
        <div className={styles.empty}>
          <p>{condition ? (locale === "id" ? "Belum ada psikolog dengan spesialisasi yang cocok untuk kondisi dan filter ini. Ini tidak berarti dukungan tidak tersedia." : "No psychologists currently list a matching specialty for this condition and these filters. This does not mean support is unavailable.") : t("directory.empty")}</p>
          <button type="button" className="button" onClick={clear}>
            {t("directory.clear")}
          </button>
          {condition && <Link className="button" href="/">{locale === "id" ? "Lihat semua psikolog" : "Browse all psychologists"}</Link>}
        </div>
      )}

      <ul className={styles.list} aria-busy={results === null}>
        {visibleProfiles.map((p) => (
          <li key={p.id} className={styles.row}>
            <div className={styles.who}>
              <span className={styles.avatar} aria-hidden="true">
                {initials(p.name)}
                {p.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- photos come from admin-entered URLs
                  <img src={p.photoUrl} alt="" loading="lazy" onError={e=>{e.currentTarget.style.display="none";}}/>
                )}
              </span>
              <div className={styles.whoText}>
                <h3><Link href={`/psychologists/${p.id}`}>{p.name}<ForwardArrow/></Link></h3>
                <p className={styles.muted}>{p.title}</p>

                {(p.gender&&p.gender!=="not_listed"||p.experienceLabel)&&<p className={styles.muted}>{[p.gender&&p.gender!=="not_listed"?t(`directory.gender.${p.gender}`):"",p.experienceLabel].filter(Boolean).join(" · ")}</p>}
              </div>
            </div>
                {profileExperienceAreas(p).length>0?<div className={styles.concernTags}>{profileExperienceAreas(p).slice(0,3).map(key=>{const a=EXPERIENCE_AREAS.find(a=>a.id===key);return <span key={key}>{a?(locale==="id"?a.idLabel:a.en):key}</span>;})}</div>:p.specialty&&<p>{p.specialty}</p>}
                {p.origin==="official"&&<p className={styles.services}>{p.serviceIds.slice(0,3).map(id=>{const s=ATTENTIVE_CATALOG.services.find(s=>s.id===id);return locale==="en"?s?.nameEn:s?.name;}).filter(Boolean).join(" · ")}</p>}
                <p className={styles.places}><MapPin size={15} aria-hidden="true"/><span>
                  {p.locationIds.length > 0
                    ? t("directory.places", { places: p.locationIds.map((id) => locationName.get(id) ?? id).join(", ") })
                    : t(p.origin==="official"?"directory.locationUnlisted":"directory.onlineOnly")}
                </span></p>

          </li>
        ))}
      </ul>
      {sorted.length>0&&<div className={styles.pagination}>
        <p>{t("directory.showing",{start:(page-1)*pageSize+1,end:Math.min(page*pageSize,sorted.length),total:sorted.length})}</p>
        {pageCount>1&&<nav aria-label={t("directory.pagination")}><button type="button" aria-label={t("directory.previousPage")} disabled={page===1} onClick={()=>goToPage(page-1)}><ChevronLeft size={18}/></button>{pageNumbers.map((n,i)=><span key={n}>{i>0&&n-pageNumbers[i-1]>1&&<span className={styles.ellipsis}>…</span>}<button type="button" aria-label={t("directory.pageNumber",{page:n})} aria-current={page===n?"page":undefined} onClick={()=>goToPage(n)}>{n}</button></span>)}<button type="button" aria-label={t("directory.nextPage")} disabled={page===pageCount} onClick={()=>goToPage(page+1)}><ChevronRight size={18}/></button></nav>}
      </div>}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
}
