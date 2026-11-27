"use client";
import { UrgentBadge } from "@/components/urgent/UrgentBadge";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, errorCode } from "@/lib/api";
import {
  addDays,
  addMonths,
  dateKey,
  daysInMonth,
  formatDate,
  formatMonth,
  formatTime,
  formatWeekdayShort,
  minutesIntoDay,
  weekStart,
  wibISO,
} from "@/lib/time";
import { useAppLocale } from "@/lib/i18n";
import { useApi } from "@/lib/useApi";
import type { Booking } from "@/lib/types";
import {useAdminBranch,branchLocation} from "./AdminBranch";
import { useDirectory } from "./useDirectory";
import styles from "./AdminCalendar.module.css";

const noon = (k: string) => `${k}T05:00:00Z`;
const PX = 1.1; // pixels per minute
type Act = (fn: () => Promise<unknown>) => Promise<void>;
type Hours = { weekday: number; start: string; end: string; mode: "online" | "in_person"; locationId?: string };
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Fit the grid to what is on it: at least 08:00-18:00 WIB. */
function range(list: Booking[], hours: Hours[]): [number, number] {
  let start = 8 * 60;
  let end = 18 * 60;
  for (const b of list) {
    start = Math.min(start, Math.floor(minutesIntoDay(b.start) / 60) * 60);
    end = Math.max(end, Math.ceil((minutesIntoDay(b.end) || minutesIntoDay(b.start) + 60) / 60) * 60);
  }
  for (const h of hours) {
    start = Math.min(start, Math.floor(toMin(h.start) / 60) * 60);
    end = Math.max(end, Math.ceil(toMin(h.end) / 60) * 60);
  }
  return [start, Math.min(end, 24 * 60)];
}

/** The admin's main screen (G09-9): a psychologist's week with their working hours, or everyone's day. */
export function AdminCalendar({ now = new Date() }: { now?: Date }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const { catalog, psychologists } = useDirectory();
  const [view, setView] = useState<"week" | "day">("week");
  const [from, setFrom] = useState(() => weekStart(dateKey(now)));
  const [chosenPsych, setPsych] = useState("");
  const branch=useAdminBranch();
  const [place, setPlace] = useState(branchLocation(branch));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setError] = useState<string | null>(null);
  const psych = chosenPsych || psychologists[0]?.id || "";
  const span = view === "week" ? 7 : 1;

  let url: string | null = null;
  if (view === "day" || psych) {
    const q = new URLSearchParams({ from, to: addDays(from, span - 1) });
    if (view === "week") q.set("psychologist", psych);
    if (place) q.set("location", place);
    url = `/api/admin/bookings?${q}`;
  }
  const res = useApi<{ bookings: Booking[] }>(url);
  const hoursRes = useApi<{ hours: Hours[] }>(view === "week" && psych ? `/api/admin/psychologists/${psych}/hours` : null);
  const list = res.data?.bookings ?? null;
  const error = actionError ?? res.error ?? null;
  const selected = list?.find((b) => b.id === selectedId) ?? null;

  const act: Act = async (fn) => {
    try {
      await fn();
      setError(null);
      res.reload();
    } catch (e) {
      setError(errorCode(e));
    }
  };

  const needsMarking = (b: Booking) => b.status === "confirmed" && new Date(b.start) <= now;
  const statusText = (b: Booking) => (needsMarking(b) ? t("admin.needsMarking") : t(`bookings.status.${b.status}`));
  const label = (b: Booking) => t("admin.blockLabel", { time: formatTime(b.start, locale), client: b.clientName, status: statusText(b) });
  const psychName = psychologists.find((p) => p.id === psych)?.name ?? "";
  const title =
    view === "day"
      ? formatDate(noon(from), locale)
      : `${formatDate(noon(from), locale)} – ${formatDate(noon(addDays(from, 6)), locale)}${psychName ? `, ${psychName}` : ""}`;

  const jump = (k: string) => {
    setFrom(view === "week" ? weekStart(k) : k);
    setSelectedId(null);
  };

  return (
    <div className={styles.layout}>
      <aside className={styles.side}>
        <MiniMonth from={from} span={span} today={dateKey(now)} onPick={jump} />
        <div role="group" aria-labelledby="psych-list" className={styles.sideCard} data-hidden={view === "day" || undefined}>
          <h2 id="psych-list" className={styles.sideTitle}>
            {t("admin.psychologist")}
          </h2>
          {psychologists.map((p) => (
            <button
              key={p.id}
              type="button"
              className={styles.psych}
              aria-pressed={p.id === psych}
              onClick={() => {
                setPsych(p.id);
                setSelectedId(null);
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className={styles.sideCard} aria-hidden="true">
          <h2 className={styles.sideTitle}>{t("admin.key")}</h2>
          <span className={styles.key} data-key="in_person">
            {t("admin.keyInPerson")}
          </span>
          <span className={styles.key} data-key="online">
            {t("admin.keyOnline")}
          </span>
          <span className={styles.key} data-key="off">
            {t("admin.keyOff")}
          </span>
          <span className={styles.key} data-key="confirmed">
            {t("bookings.status.confirmed")}
          </span>
          <span className={styles.key} data-key="needs">
            {t("admin.needsMarking")}
          </span>
          <span className={styles.key} data-key="attended">
            {t("bookings.status.attended")}
          </span>
          <span className={styles.key} data-key="no_show">
            {t("bookings.status.no_show")}
          </span>
        </div>
      </aside>

      <section className={styles.main} aria-labelledby="cal-title">
        <div className={styles.toolbar}>
          <button type="button" className="button-quiet" onClick={() => jump(dateKey(now))}>
            {t("psy.today")}
          </button>
          <button type="button" className="button-quiet" aria-label={view === "week" ? t("admin.prevWeek") : t("admin.prevDay")} onClick={() => setFrom(addDays(from, -span))}>
            ‹
          </button>
          <button type="button" className="button-quiet" aria-label={view === "week" ? t("admin.nextWeek") : t("admin.nextDay")} onClick={() => setFrom(addDays(from, span))}>
            ›
          </button>
          <h2 id="cal-title" className={styles.title}>
            {title}
            {list && <span>{t("admin.sessionsCount", { count: list.filter((b) => b.status !== "cancelled").length })}</span>}
          </h2>
          <label className={styles.place}>
            <span className="visually-hidden">{t("admin.location")}</span>
            <select disabled={branch!=="all"} value={place} onChange={(e) => setPlace(e.target.value)}>
              <option value="">{t("admin.allPlaces")}</option>
              <option value="online">{t("admin.online")}</option>
              {catalog.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.segmented} role="group" aria-label={t("admin.view")}>
            {(["day", "week"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => {
                  setView(v);
                  setSelectedId(null);
                  setFrom(v === "week" ? weekStart(from) : weekStart(from) === weekStart(dateKey(now)) ? dateKey(now) : from);
                }}
              >
                {t(`psy.${v}`)}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className={styles.error}>
            {t(`errors.${error}`)}
          </p>
        )}

        {list === null ? (
          <div className={styles.skeleton} aria-hidden="true" />
        ) : view === "week" ? (
          <WeekGrid from={from} list={list} hours={(hoursRes.data?.hours ?? []).filter(h=>branch==="all"||h.locationId===branch)} now={now} label={label} needsMarking={needsMarking} selectedId={selectedId} onSelect={setSelectedId} />
        ) : list.length === 0 ? (
          <p className={styles.muted}>{t("admin.empty")}</p>
        ) : (
          <DayGrid list={list} now={now} day={from} label={label} needsMarking={needsMarking} selectedId={selectedId} onSelect={setSelectedId} />
        )}
      </section>

      {selected && <Panel b={selected} now={now} statusText={statusText(selected)} needsMarking={needsMarking(selected)} act={act} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function MiniMonth({ from, span, today, onPick }: { from: string; span: number; today: string; onPick: (k: string) => void }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const [month, setMonth] = useState(from.slice(0, 7));
  const start = weekStart(`${month}-01`);
  const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const cells: string[] = [];
  for (let k = start; k <= last || cells.length % 7 !== 0; k = addDays(k, 1)) cells.push(k);
  const end = addDays(from, span - 1);
  return (
    <div className={styles.sideCard}>
      <div className={styles.miniHead}>
        <span className={styles.sideTitle}>{formatMonth(month, locale)}</span>
        <span>
          <button type="button" className={styles.miniNav} aria-label={t("band.prevMonth")} onClick={() => setMonth(addMonths(month, -1))}>
            ‹
          </button>
          <button type="button" className={styles.miniNav} aria-label={t("band.nextMonth")} onClick={() => setMonth(addMonths(month, 1))}>
            ›
          </button>
        </span>
      </div>
      <div className={styles.mini}>
        {cells.slice(0, 7).map((k) => (
          <span key={`h${k}`} className={styles.miniWeekday} aria-hidden="true">
            {formatWeekdayShort(noon(k), locale).slice(0, 1)}
          </span>
        ))}
        {cells.map((k) => (
          <button
            key={k}
            type="button"
            className={styles.miniDay}
            data-outside={!k.startsWith(month) || undefined}
            data-in-range={(k >= from && k <= end) || undefined}
            data-today={k === today || undefined}
            aria-label={formatDate(noon(k), locale)}
            onClick={() => onPick(k)}
          >
            {Number(k.slice(8))}
          </button>
        ))}
      </div>
    </div>
  );
}

type GridProps = {
  list: Booking[];
  now: Date;
  label: (b: Booking) => string;
  needsMarking: (b: Booking) => boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function Block({ b, top, height, label, needs, selected, onSelect }: { b: Booking; top: number; height: number; label: string; needs: boolean; selected: boolean; onSelect: () => void }) {
  const locale = useAppLocale();
  return (
    <button
      type="button"
      className={styles.block}
      data-status={needs ? "needs" : b.status}
      aria-pressed={selected}
      aria-label={label}
      style={{ top, height }}
      onClick={onSelect}
    >
      <span className={styles.blockTime}>{formatTime(b.start, locale)}</span>
      <span className={styles.blockName}>{b.clientName}</span>
      <UrgentBadge urgent={b.isUrgent} />
    </button>
  );
}

function WeekGrid({ from, list, hours, now, label, needsMarking, selectedId, onSelect }: GridProps & { from: string; hours: Hours[] }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const [start, end] = range(list, hours);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const ticks = Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start / 60 + i);
  const today = dateKey(now);
  const nowMin = minutesIntoDay(now);
  return (
    <div className={styles.week}>
      <div className={styles.corner} />
      {days.map((d) => (
        <div key={`h${d}`} className={styles.dayHead} aria-hidden="true">
          <span>{formatWeekdayShort(noon(d), locale)}</span>
          <strong data-today={d === today || undefined}>{Number(d.slice(8))}</strong>
        </div>
      ))}
      <div className={styles.axis} style={{ height: (end - start) * PX }} aria-hidden="true">
        {ticks.map((h) => (
          <span key={h} style={{ top: (h * 60 - start) * PX }}>
            {formatTime(wibISO(from, `${String(h).padStart(2, "0")}:00`), locale)}
          </span>
        ))}
      </div>
      {days.map((d) => {
        const weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
        const work = hours.filter((h) => h.weekday === weekday);
        return (
          <section key={d} aria-label={formatDate(noon(d), locale)} className={styles.dayCol} style={{ height: (end - start) * PX }}>
            {work.map((w) => (
              <span key={w.start} className={styles.work} data-mode={w.mode} style={{ top: (toMin(w.start) - start) * PX, height: (toMin(w.end) - toMin(w.start)) * PX }}>
                <span className="visually-hidden">
                  {t("admin.working", { from: w.start, to: w.end, where: w.mode === "online" ? t("admin.workOnline") : t("admin.workInPerson") })}
                </span>
              </span>
            ))}
            {ticks.map((h) => (
              <i key={h} className={styles.hourLine} style={{ top: (h * 60 - start) * PX }} />
            ))}
            {d === today && nowMin >= start && nowMin <= end && <i className={styles.nowLine} style={{ top: (nowMin - start) * PX }} />}
            {list
              .filter((b) => dateKey(b.start) === d)
              .map((b) => {
                const s = Math.max(minutesIntoDay(b.start), start);
                const e = Math.min(minutesIntoDay(b.end) || s + 60, end);
                return (
                  <Block
                    key={b.id}
                    b={b}
                    top={(s - start) * PX + 2}
                    height={Math.max(30, (e - s) * PX - 4)}
                    label={label(b)}
                    needs={needsMarking(b)}
                    selected={b.id === selectedId}
                    onSelect={() => onSelect(b.id)}
                  />
                );
              })}
          </section>
        );
      })}
    </div>
  );
}

function DayGrid({ list, now, day, label, needsMarking, selectedId, onSelect }: GridProps & { day: string }) {
  const locale = useAppLocale();
  const [start, end] = range(list, []);
  const columns = new Map<string, Booking[]>();
  for (const b of [...list].sort((a, z) => a.psychologistName.localeCompare(z.psychologistName))) {
    columns.set(b.psychologistName, [...(columns.get(b.psychologistName) ?? []), b]);
  }
  const ticks = Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start / 60 + i);
  const nowMin = minutesIntoDay(now);
  const showNow = dateKey(now) === day && nowMin >= start && nowMin <= end;
  return (
    <div className={styles.dayGrid} style={{ ["--cols" as string]: columns.size }}>
      <div className={styles.corner} />
      {[...columns.keys()].map((name) => (
        <div key={`h${name}`} className={styles.dayHead} aria-hidden="true">
          <strong>{name}</strong>
        </div>
      ))}
      <div className={styles.axis} style={{ height: (end - start) * PX }} aria-hidden="true">
        {ticks.map((h) => (
          <span key={h} style={{ top: (h * 60 - start) * PX }}>
            {formatTime(wibISO(day, `${String(h).padStart(2, "0")}:00`), locale)}
          </span>
        ))}
      </div>
      {[...columns].map(([name, items]) => (
        <section key={name} aria-label={name} className={styles.dayCol} style={{ height: (end - start) * PX }}>
          {ticks.map((h) => (
            <i key={h} className={styles.hourLine} style={{ top: (h * 60 - start) * PX }} />
          ))}
          {showNow && <i className={styles.nowLine} style={{ top: (nowMin - start) * PX }} />}
          {items.map((b) => {
            const s = Math.max(minutesIntoDay(b.start), start);
            const e = Math.min(minutesIntoDay(b.end) || s + 60, end);
            return (
              <Block
                key={b.id}
                b={b}
                top={(s - start) * PX + 2}
                height={Math.max(30, (e - s) * PX - 4)}
                label={label(b)}
                needs={needsMarking(b)}
                selected={b.id === selectedId}
                onSelect={() => onSelect(b.id)}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}

function Panel({ b, now, statusText, needsMarking, act, onClose }: { b: Booking; now: Date; statusText: string; needsMarking: boolean; act: Act; onClose: () => void }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const [moveTo, setMoveTo] = useState("");
  const place = b.mode === "online" ? t(`sessionType.${b.onlineChannel ?? "video"}`) : b.locationName;
  const started = new Date(b.start) <= now;
  return (
    <section aria-label={b.code} className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.code}>{b.code}</span>
        <UrgentBadge urgent={b.isUrgent} />
        <span className={styles.status} data-status={needsMarking ? "needs" : b.status}>
          {statusText}
        </span>
      </div>
      <dl className={styles.facts}>
        <dt>{t("admin.client")}</dt>
        <dd>{b.clientName}</dd>
        <dt>{t("admin.psychologist")}</dt>
        <dd>{b.psychologistName}</dd>
        <dt>{t("admin.service")}</dt>
        <dd>{b.serviceName}</dd>
        <dt>{t("admin.when")}</dt>
        <dd>
          {formatDate(b.start, locale)}, {formatTime(b.start, locale)}
        </dd>
        <dt>{t("admin.where")}</dt>
        <dd>{place}</dd>
      </dl>
      {b.status === "confirmed" && started && (
        <div className={styles.actions}>
          <p className={styles.muted}>{t("admin.didTheyCome")}</p>
          <button type="button" className="button" onClick={() => act(() => api.post(`/api/bookings/${b.id}/attendance`, { status: "attended" }))}>
            {t("psy.markAttended")}
          </button>
          <button type="button" className="button-quiet" onClick={() => act(() => api.post(`/api/bookings/${b.id}/attendance`, { status: "no_show" }))}>
            {t("psy.markNoShow")}
          </button>
        </div>
      )}
      {b.status === "confirmed" && (
        <div className={styles.actions}>
          {!started && (
            <form
              className={styles.move}
              onSubmit={(e) => {
                e.preventDefault();
                void act(() => api.post(`/api/bookings/${b.id}/reschedule`, { start: `${moveTo}:00+07:00` }));
              }}
            >
              <label className="field">
                <span>{t("admin.moveTo")}</span>
                <input type="datetime-local" value={moveTo} step={900} required onChange={(e) => setMoveTo(e.target.value)} />
              </label>
              <button className="button-quiet">{t("admin.move")}</button>
            </form>
          )}
          <button type="button" className="button-quiet" onClick={() => act(() => api.post(`/api/bookings/${b.id}/cancel`, {}))}>
            {t("bookings.cancel")}
          </button>
          <p className={styles.muted}>{t("admin.ruleBreakNote")}</p>
        </div>
      )}
      <button type="button" className={styles.close} onClick={onClose}>
        {t("common.close")}
      </button>
    </section>
  );
}
