"use client";

import { useEffect,useState } from "react";
import { useTranslations } from "next-intl";
import { addDays, daysInMonth, formatDate, formatMonth, formatTime, formatWeekdayShort, minutesIntoDay, weekStart } from "@/lib/time";
import { useAppLocale } from "@/lib/i18n";
import type { Day, Slot } from "@/lib/types";
import styles from "./MonthPicker.module.css";

const noon = (k: string) => `${k}T05:00:00Z`; // an instant safely inside the WIB day

type Props = {
  month: string; // "YYYY-MM"
  days: Day[]; // open slots for the bookable days of this month
  today: string; // "YYYY-MM-DD"
  selected: string | null; // chosen slot start
  onSelect: (slot: Slot) => void;
  onMonth: (delta: 1 | -1) => void;
  canGoBack: boolean;
  onDateChange?: (date:string)=>void;
};

const PARTS = [
  { key: "morning", from: 0, to: 12 * 60 },
  { key: "afternoon", from: 12 * 60, to: 17 * 60 },
  { key: "evening", from: 17 * 60, to: 24 * 60 },
] as const;

/** A month calendar (which day?) above the times of the chosen day (when?). */
export function MonthPicker({ month, days, today, selected, onSelect, onMonth, canGoBack,onDateChange }: Props) {
  const t = useTranslations("band");
  const locale = useAppLocale();
  const [picked, setPicked] = useState<string | null>(null);

  const byDate = new Map(days.map((d) => [d.date, d]));
  const open = days.filter((d) => d.slots.length > 0);
  const day = open.find((d) => d.date === picked) ?? open.find((d) => d.slots.some((s) => s.Start === selected)) ?? open[0];

  useEffect(()=>{if(day?.date)onDateChange?.(day.date)},[day?.date,onDateChange]);
  const first = `${month}-01`;
  const gridStart = weekStart(first);
  const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const cells: string[] = [];
  for (let k = gridStart; k <= last || cells.length % 7 !== 0; k = addDays(k, 1)) cells.push(k);
  const headers = cells.slice(0, 7).map((k) => formatWeekdayShort(noon(k), locale));
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  return (
    <div className={styles.picker}>
      <div className={styles.head}>
        <button type="button" className={styles.nav} aria-label={t("prevMonth")} disabled={!canGoBack} onClick={() => onMonth(-1)}>
          ‹
        </button>
        <span className={styles.month}>{formatMonth(month, locale)}</span>
        <button type="button" className={styles.nav} aria-label={t("nextMonth")} onClick={() => onMonth(1)}>
          ›
        </button>
      </div>

      <div role="grid" aria-label={formatMonth(month, locale)} className={styles.grid}>
        <div role="row" className={styles.row}>
          {headers.map((h) => (
            <span key={h} role="columnheader" className={styles.weekday}>
              {h}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div role="row" key={week[0]} className={styles.row}>
            {week.map((k) => {
              const inMonth = k.startsWith(month);
              if (!inMonth) {
                return (
                  <span role="gridcell" key={k} className={styles.outside} aria-hidden="true">
                    {Number(k.slice(8))}
                  </span>
                );
              }
              const count = byDate.get(k)?.slots.length ?? 0;
              const bookable = k > today;
              const state = !bookable ? "past" : count > 0 ? "open" : "none";
              const date = formatDate(noon(k), locale);
              return (
                <span role="gridcell" key={k}>
                  <button
                    type="button"
                    className={styles.day}
                    data-state={state}
                    data-today={k === today || undefined}
                    disabled={state !== "open"}
                    aria-pressed={k === day?.date}
                    aria-label={bookable ? t("dayChip", { date, count }) : t("notBookable", { date })}
                    onClick={() => setPicked(k)}
                  >
                    <span className={styles.num}>{Number(k.slice(8))}</span>
                    <span className={styles.count} aria-hidden="true">
                      {k === today ? t("legendToday") : state === "open" ? count : ""}
                    </span>
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>

      <div className={styles.legend} aria-hidden="true">
        <span data-key="open">{t("legendOpen")}</span>
        <span data-key="chosen">{t("legendChosen")}</span>
        <span data-key="none">{t("legendNone")}</span>
      </div>

      {!day ? (
        <p className={styles.empty}>{t("emptyMonth")}</p>
      ) : (
        <section aria-label={t("pickTimeOn", { date: formatDate(noon(day.date), locale) })} className={styles.times}>
          <div className={styles.timesHead}>
            <h3>{t("pickTimeOn", { date: formatDate(noon(day.date), locale) })}</h3>
            <span>{t("wib")}</span>
          </div>
          {PARTS.map((p) => {
            const slots = day.slots.filter((s) => {
              const m = minutesIntoDay(s.Start);
              return m >= p.from && m < p.to;
            });
            return (
              <div key={p.key} role="group" aria-label={t(p.key)} className={styles.part}>
                <span className={styles.partLabel} aria-hidden="true">
                  {t(p.key)}
                </span>
                <div className={styles.partTimes}>
                  {slots.length === 0 ? (
                    <span className={styles.noneInGroup}>{t("noneInGroup")}</span>
                  ) : (
                    slots.map((s) => (
                      <button key={s.Start} type="button" className={styles.time} aria-pressed={s.Start === selected} onClick={() => onSelect(s)}>
                        {formatTime(s.Start, locale)}
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
