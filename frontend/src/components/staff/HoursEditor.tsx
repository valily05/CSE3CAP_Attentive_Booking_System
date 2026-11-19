"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { api, errorCode } from "@/lib/api";
import {
  addDays,
  addMonths,
  daysInMonth,
  formatDate,
  formatMonth,
  formatMonthName,
  formatWeekdayShort,
  todayKey,
  weekdayName,
  weekdayShortName,
  weekStart,
} from "@/lib/time";
import { useAppLocale } from "@/lib/i18n";
import type { Catalog } from "@/lib/types";
import styles from "./HoursEditor.module.css";

type Hours = { weekday: number; start: string; end: string; mode: "online" | "in_person"; locationId?: string };
// Monday first, as people plan their week.
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const GRID_START = 7 * 60;
const GRID_END = 21 * 60;
const PX = 0.75;
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
// Every quarter hour from 06:00 to 22:00, always 24-hour like the rest of the app.
const QUARTERS = Array.from({ length: 65 }, (_, i) => toHHMM(6 * 60 + i * 15));
const noon = (k: string) => `${k}T05:00:00Z`;

/** Weekly hours and time off (G09-3). `base` is /api/psy or /api/admin/psychologists/{id}. */
export function HoursEditor({ base, today = todayKey() }: { base: string; today?: string }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const [hours, setHours] = useState<Hours[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [locations, setLocations] = useState<Catalog["locations"]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ hours: Hours[] }>(`${base}/hours`).then((r) => setHours(r.hours), (e) => setError(errorCode(e)));
    api.get<Catalog>("/api/catalog").then((c) => setLocations(c.locations), () => {});
  }, [base]);

  if (!hours) return error ? <p role="alert">{t(`errors.${error}`)}</p> : <p>{t("common.loading")}</p>;

  const where = (h: Hours) => (h.mode === "online" ? t("psy.online") : (locations.find((l) => l.id === h.locationId)?.name ?? h.locationId ?? ""));
  const update = (i: number, patch: Partial<Hours>) => setHours(hours.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  const add = (weekday: number) => {
    const sameDay = hours.filter((h) => h.weekday === weekday);
    const after = sameDay.length ? Math.max(...sameDay.map((h) => toMin(h.end))) : 9 * 60;
    const start = Math.min(after, GRID_END - 60);
    setHours([...hours, { weekday, start: toHHMM(start), end: toHHMM(Math.min(start + 180, GRID_END)), mode: "online" }]);
    setSelected(hours.length);
  };

  async function save() {
    setError(null);
    setNotice(null);
    const clean = hours!.map(({ weekday, start, end, mode, locationId }) => (mode === "online" ? { weekday, start, end, mode } : { weekday, start, end, mode, locationId }));
    try {
      const r = await api.put<{ bookingsOutsideHours?: string[] } | undefined>(`${base}/hours`, { hours: clean });
      setNotice(r?.bookingsOutsideHours?.length ? t("psy.outsideHours", { codes: r.bookingsOutsideHours.join(", ") }) : t("psy.hoursSaved"));
    } catch (e) {
      setError(errorCode(e));
    }
  }

  const sel = selected !== null ? hours[selected] : null;
  const ticks = Array.from({ length: (GRID_END - GRID_START) / 120 + 1 }, (_, i) => GRID_START + i * 120);

  return (
    <div className={styles.layout}>
      <section className={styles.card} aria-labelledby="usual-week">
        <div className={styles.cardHead}>
          <h2 id="usual-week">{t("psy.usualWeek")}</h2>
          <p className={styles.muted}>{t("psy.hoursBody")}</p>
        </div>
        <div className={styles.week}>
          <div className={styles.axis} aria-hidden="true">
            {ticks.map((m) => (
              <span key={m} style={{ top: (m - GRID_START) * PX }}>
                {toHHMM(m)}
              </span>
            ))}
          </div>
          {WEEK.map((d) => (
            <section key={d} aria-label={weekdayName(d, locale)} className={styles.day}>
              <div className={styles.dayHead}>
                <span aria-hidden="true">{weekdayShortName(d, locale)}</span>
                <button type="button" className={styles.add} aria-label={t("psy.addHoursOn", { day: weekdayName(d, locale) })} onClick={() => add(d)}>
                  +
                </button>
              </div>
              <div className={styles.lane} style={{ height: (GRID_END - GRID_START) * PX }}>
                {ticks.map((m) => (
                  <i key={m} className={styles.line} style={{ top: (m - GRID_START) * PX }} />
                ))}
                {hours.map((h, i) =>
                  h.weekday !== d ? null : (
                    <button
                      key={i}
                      type="button"
                      className={styles.block}
                      data-mode={h.mode}
                      aria-pressed={selected === i}
                      aria-label={`${weekdayName(d, locale)} ${h.start} – ${h.end}, ${where(h)}`}
                      style={{ top: (Math.max(toMin(h.start), GRID_START) - GRID_START) * PX, height: Math.max(24, (Math.min(toMin(h.end), GRID_END) - Math.max(toMin(h.start), GRID_START)) * PX) }}
                      onClick={() => setSelected(i)}
                    >
                      <strong>
                        {h.start} – {h.end}
                      </strong>
                      <span>{where(h)}</span>
                    </button>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>

        {sel && selected !== null ? (
          <div role="group" aria-label={t("psy.selectedHours")} className={styles.editor}>
            <span className={styles.editorTitle}>{weekdayName(sel.weekday, locale)}</span>
            <label className="field">
              <span>{t("psy.from")}</span>
              <TimeSelect value={sel.start} onChange={(v) => update(selected, { start: v })} />
            </label>
            <label className="field">
              <span>{t("psy.to")}</span>
              <TimeSelect value={sel.end} onChange={(v) => update(selected, { end: v })} />
            </label>
            <label className="field">
              <span>{t("psy.mode")}</span>
              <select
                value={sel.mode === "online" ? "online" : `in_person:${sel.locationId ?? ""}`}
                onChange={(e) => {
                  const [mode, loc] = e.target.value.split(":");
                  update(selected, mode === "online" ? { mode: "online", locationId: undefined } : { mode: "in_person", locationId: loc });
                }}
              >
                <option value="online">{t("psy.online")}</option>
                {locations.map((l) => (
                  <option key={l.id} value={`in_person:${l.id}`}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button-quiet"
              onClick={() => {
                setHours(hours.filter((_, j) => j !== selected));
                setSelected(null);
              }}
            >
              {t("psy.remove")}
            </button>
          </div>
        ) : (
          <p className={styles.hint}>{t("psy.gridHint")}</p>
        )}

        <div className={styles.saveRow}>
          <button type="button" className="button" onClick={save}>
            {t("psy.saveHours")}
          </button>
          <p role="status" className={styles.notice}>
            {notice}
          </p>
          {error && (
            <p role="alert" className={styles.error}>
              {t(`errors.${error}`)}
            </p>
          )}
        </div>
      </section>

      <TimeOff base={base} today={today} />
    </div>
  );
}

function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = QUARTERS.includes(value) ? QUARTERS : [value, ...QUARTERS];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((q) => (
        <option key={q} value={q}>
          {q}
        </option>
      ))}
    </select>
  );
}

/** Time off (whole days, picked as a range) or a block (a few hours on one day). */
function TimeOff({ base, today }: { base: string; today: string }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const id = useId();
  const [kind, setKind] = useState<"time_off" | "block">("time_off");
  const [month, setMonth] = useState(addDays(today, 1).slice(0, 7));
  const [first, setFirst] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [from, setFrom] = useState("10:00");
  const [to, setTo] = useState("11:00");
  const [label, setLabel] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (k: string) => {
    setDone(false);
    if (kind === "block" || !first || last || k < first) {
      setFirst(k);
      setLast(null);
    } else {
      setLast(k);
    }
  };
  const end = kind === "block" ? first : (last ?? first);
  const monthName = (k: string) => formatMonthName(noon(k), locale);
  const rangeText =
    first && end
      ? first === end
        ? `${Number(first.slice(8))} ${monthName(first)}`
        : first.slice(0, 7) === end.slice(0, 7)
          ? `${Number(first.slice(8))} – ${Number(end.slice(8))} ${monthName(end)}`
          : `${Number(first.slice(8))} ${monthName(first)} – ${Number(end.slice(8))} ${monthName(end)}`
      : "";

  async function submit() {
    if (!first || !end) return;
    const body =
      kind === "time_off"
        ? { kind, label, start: `${first}T00:00:00+07:00`, end: `${addDays(end, 1)}T00:00:00+07:00` }
        : { kind, label, start: `${first}T${from}:00+07:00`, end: `${first}T${to}:00+07:00` };
    try {
      await api.post(`${base}/unavailability`, body);
      setDone(true);
      setError(null);
      setFirst(null);
      setLast(null);
    } catch (e) {
      setError(errorCode(e));
    }
  }

  const gridStart = weekStart(`${month}-01`);
  const lastDay = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const cells: string[] = [];
  for (let k = gridStart; k <= lastDay || cells.length % 7 !== 0; k = addDays(k, 1)) cells.push(k);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  return (
    <section aria-labelledby={id} className={styles.card}>
      <h2 id={id}>{t("psy.timeOffTitle")}</h2>
      <div role="radiogroup" aria-label={t("psy.kind")} className={styles.kinds}>
        {(["time_off", "block"] as const).map((k) => (
          <label key={k} className={styles.kind}>
            <input
              type="radio"
              name={`${id}-kind`}
              checked={kind === k}
              onChange={() => {
                setKind(k);
                setFirst(null);
                setLast(null);
              }}
            />
            <span>{k === "time_off" ? t("psy.timeOff") : t("psy.block")}</span>
          </label>
        ))}
      </div>
      <p className={styles.muted}>{kind === "time_off" ? t("psy.pickRange") : t("psy.pickDay")}</p>

      <div className={styles.monthHead}>
        <button type="button" className={styles.nav} aria-label={t("band.prevMonth")} disabled={month <= today.slice(0, 7)} onClick={() => setMonth(addMonths(month, -1))}>
          ‹
        </button>
        <strong>{formatMonth(month, locale)}</strong>
        <button type="button" className={styles.nav} aria-label={t("band.nextMonth")} onClick={() => setMonth(addMonths(month, 1))}>
          ›
        </button>
      </div>
      <div role="grid" aria-label={formatMonth(month, locale)} className={styles.month}>
        <div role="row" className={styles.monthRow}>
          {cells.slice(0, 7).map((k) => (
            <span key={k} role="columnheader" className={styles.monthWeekday}>
              {formatWeekdayShort(noon(k), locale)}
            </span>
          ))}
        </div>
        {weeks.map((w) => (
          <div role="row" key={w[0]} className={styles.monthRow}>
            {w.map((k) =>
              !k.startsWith(month) ? (
                <span role="gridcell" key={k} />
              ) : (
                <span role="gridcell" key={k}>
                  <button
                    type="button"
                    className={styles.monthDay}
                    disabled={k <= today}
                    data-edge={k === first || k === end || undefined}
                    data-in-range={(first && end && k > first && k < end) || undefined}
                    aria-pressed={!!first && !!end && k >= first && k <= end}
                    aria-label={formatDate(noon(k), locale)}
                    onClick={() => pick(k)}
                  >
                    {Number(k.slice(8))}
                  </button>
                </span>
              ),
            )}
          </div>
        ))}
      </div>

      {kind === "block" && (
        <div className={styles.blockTimes}>
          <label className="field">
            <span>{t("psy.from")}</span>
            <TimeSelect value={from} onChange={setFrom} />
          </label>
          <label className="field">
            <span>{t("psy.to")}</span>
            <TimeSelect value={to} onChange={setTo} />
          </label>
        </div>
      )}
      <label className="field">
        <span>{t("psy.label")}</span>
        <input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <button type="button" className="button" disabled={!first} onClick={submit}>
        {!first
          ? kind === "time_off"
            ? t("psy.pickRange")
            : t("psy.pickDay")
          : kind === "time_off"
            ? t("psy.addRange", { range: rangeText })
            : t("psy.blockOn", { date: formatDate(noon(first), locale), from, to })}
      </button>
      {done && <p className={styles.notice}>{t("psy.timeOffAdded")}</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {t(`errors.${error}`)}
        </p>
      )}
    </section>
  );
}
