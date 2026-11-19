"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { api, errorCode } from "@/lib/api";
import { formatDateTime, formatShortDay } from "@/lib/time";
import { useAppLocale } from "@/lib/i18n";
import type { AgeGroup, Catalog, Mode, Psychologist } from "@/lib/types";
import styles from "./PsychologistSearch.module.css";

type Filters = { ageGroup: "" | AgeGroup; mode: "" | Mode; location: string };
const NONE: Filters = { ageGroup: "", mode: "", location: "" };
const AGE_GROUPS: AgeGroup[] = ["adult", "child_teen", "family_couple"];
type Sort = "soonest" | "name";

type Props = { onCount?: (n: number) => void; reassurance?: ReactNode };

/** G09-2: filter buttons and a directory that shows who is free this week. */
export function PsychologistSearch({ onCount, reassurance }: Props) {
  const t = useTranslations();
  const locale = useAppLocale();
  const [catalog, setCatalog] = useState<Catalog>({ locations: [], services: [] });
  const [filters, setFilters] = useState<Filters>(NONE);
  const [sort, setSort] = useState<Sort>("soonest");
  const [results, setResults] = useState<Psychologist[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const locationName = useMemo(() => new Map(catalog.locations.map((l) => [l.id, l.name])), [catalog]);
  const sorted = useMemo(() => {
    const list = [...(results ?? [])];
    if (sort === "name") return list.sort((a, b) => a.name.localeCompare(b.name));
    return list.sort((a, b) => (a.nextOpen ?? "9999").localeCompare(b.nextOpen ?? "9999") || a.name.localeCompare(b.name));
  }, [results, sort]);
  // Pressing a chosen button again clears that filter.
  const toggle = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => {
      const next = { ...f, [key]: f[key] === value ? "" : value };
      if (key === "mode" && next.mode === "online") next.location = "";
      return next;
    });
  const anyFilter = filters.ageGroup || filters.mode || filters.location;

  return (
    <div className={styles.search}>
      <section className={styles.filters} aria-label={t("directory.label")}>
        <div role="group" aria-labelledby="f-who" className={styles.group}>
          <span id="f-who" className={styles.groupLabel}>
            {t("filter.who")}
          </span>
          <div className={styles.buttons}>
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
        {anyFilter && (
          <button type="button" className={styles.clear} onClick={() => setFilters(NONE)}>
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

      <div className={styles.bar}>
        {results !== null && (
          <p className={styles.count} aria-live="polite">
            {t("directory.count", { count: results.length })}
          </p>
        )}
        <label className={styles.sort}>
          {t("directory.sort")}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="soonest">{t("directory.sortSoonest")}</option>
            <option value="name">{t("directory.sortName")}</option>
          </select>
        </label>
      </div>

      {results?.length === 0 && (
        <div className={styles.empty}>
          <p>{t("directory.empty")}</p>
          <button type="button" className="button" onClick={() => setFilters(NONE)}>
            {t("directory.clear")}
          </button>
        </div>
      )}

      <ul className={styles.list} aria-busy={results === null}>
        {sorted.map((p) => (
          <li key={p.id} className={styles.row}>
            <div className={styles.who}>
              <span className={styles.avatar} aria-hidden="true">
                {p.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- photos come from admin-entered URLs
                  <img src={p.photoUrl} alt="" />
                ) : (
                  initials(p.name)
                )}
              </span>
              <div className={styles.whoText}>
                <h3>{p.name}</h3>
                <p className={styles.muted}>{p.title}</p>
                {p.specialty && <p>{p.specialty}</p>}
                <p className={styles.muted}>
                  {p.locationIds.length > 0
                    ? t("directory.places", { places: p.locationIds.map((id) => locationName.get(id) ?? id).join(", ") })
                    : t("directory.onlineOnly")}
                </p>
              </div>
            </div>

            {p.week && p.week.length > 0 && (
              <div className={styles.week}>
                <table aria-label={t("directory.weekLabel", { name: p.name })}>
                  <thead>
                    <tr>
                      {p.week.map((d) => (
                        <th key={d.date} scope="col">
                          {formatShortDay(`${d.date}T05:00:00Z`, locale)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {p.week.map((d) => (
                        <td key={d.date} data-level={d.count === 0 ? "none" : d.count >= 4 ? "many" : "some"}>
                          {d.count === 0 ? "–" : d.count}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
                <p className={styles.muted}>{t("directory.perDay")}</p>
              </div>
            )}

            <div className={styles.next}>
              <p>{p.nextOpen ? t("directory.nextOpen", { when: formatDateTime(p.nextOpen, locale) }) : t("directory.noneSoon")}</p>
              <Link href={`/psychologists/${p.id}`} className="button" aria-label={t("directory.seeTimes", { name: p.name })}>
                {t("directory.seeTimesShort")}
              </Link>
            </div>
          </li>
        ))}
      </ul>
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
