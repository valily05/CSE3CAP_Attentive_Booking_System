// The only module allowed to format dates (lint rule attentive/wib-time-only).
// Every time a person sees is Western Indonesia Time, whatever their device says.

export type Locale = "en" | "id";

const ZONE = "Asia/Jakarta";
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000; // WIB has no daylight saving
const tag = (l: Locale) => (l === "id" ? "id-ID" : "en-GB");

type When = string | Date;
const toDate = (w: When) => (typeof w === "string" ? new Date(w) : w);

const fmt = (l: Locale, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag(l), { timeZone: ZONE, ...o });

/** "14:00" (en) or "14.00" (id). */
export function formatTime(w: When, l: Locale): string {
  return fmt(l, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(toDate(w));
}

/** Twelve-hour session time, always in WIB. */
export function formatTime12(w: When): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hour12: true }).format(toDate(w));
}

/** "Monday 9 March" (en) or "Senin, 9 Maret" (id). */
export function formatDate(w: When, l: Locale): string {
  return fmt(l, { weekday: "long", day: "numeric", month: "long" }).format(toDate(w));
}

/** "Monday 9 March, 08:00 WIB". */
export function formatDateTime(w: When, l: Locale): string {
  return `${formatDate(w, l)}, ${formatTime(w, l)} WIB`;
}

/** Full stored event timestamp, including its year, in WIB. */
export function formatFullDateTime(w: When, l: Locale): string {
  return fmt(l, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(toDate(w)) + " WIB";
}

/** "Mon 9" style short day for compact rows. */
export function formatShortDay(w: When, l: Locale): string {
  return fmt(l, { weekday: "short", day: "numeric" }).format(toDate(w));
}

/** Weekday name for a 0-6 index (0 = Sunday). */
export function weekdayName(i: number, l: Locale): string {
  // 4 January 2026 was a Sunday.
  return fmt(l, { weekday: "long" }).format(new Date(Date.UTC(2026, 0, 4 + i, 5)));
}

const wibShift = (w: When) => new Date(toDate(w).getTime() + WIB_OFFSET_MS);

/** YYYY-MM-DD of the WIB calendar day. */
export function dateKey(w: When): string {
  return wibShift(w).toISOString().slice(0, 10);
}

/** Minutes since 00:00 WIB. */
export function minutesIntoDay(w: When): number {
  const d = wibShift(w);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

const keyToUTC = (k: string) => new Date(`${k}T00:00:00Z`);

/** Moves a YYYY-MM-DD key by n days. */
export function addDays(k: string, n: number): string {
  const d = keyToUTC(k);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Monday on or before the given day. */
export function weekStart(k: string): string {
  const dow = keyToUTC(k).getUTCDay(); // 0 = Sunday
  return addDays(k, dow === 0 ? -6 : 1 - dow);
}

/** Today's WIB date key. */
export function todayKey(): string {
  return dateKey(new Date());
}

/** A WIB wall-clock date and time ("2026-03-09", "14:00") as an ISO instant. */
export function wibISO(k: string, hhmm: string): string {
  return `${k}T${hhmm}:00+07:00`;
}

/** "Mon" (en) or "Sen" (id). */
export function formatWeekdayShort(w: string | Date, l: Locale): string {
  return fmt(l, { weekday: "short" }).format(toDate(w)).replace(/\.$/, "");
}

/** "today", "tomorrow", "in 4 days" (en) / "hari ini", "besok", "dalam 4 hari" (id), by WIB calendar day. */
export function relativeDay(w: string | Date, now: string | Date, l: Locale): string {
  const days = Math.round((keyToUTC(dateKey(w)).getTime() - keyToUTC(dateKey(now)).getTime()) / 86_400_000);
  return new Intl.RelativeTimeFormat(tag(l), { numeric: "auto" }).format(days, "day");
}

/** "March 2026" (en) or "Maret 2026" (id) for "2026-03". */
export function formatMonth(month: string, l: Locale): string {
  return fmt(l, { month: "long", year: "numeric" }).format(new Date(`${month}-15T05:00:00Z`));
}

/** Days in a "YYYY-MM" month. */
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "2026-03" plus n months. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** "Mar" (en) or "Mar" (id). */
export function formatMonthShort(w: string | Date, l: Locale): string {
  return fmt(l, { month: "short" }).format(toDate(w)).replace(/\.$/, "");
}

/** "March" (en) or "Maret" (id). */
export function formatMonthName(w: string | Date, l: Locale): string {
  return fmt(l, { month: "long" }).format(toDate(w));
}

/** Short weekday name for a 0-6 index (0 = Sunday): "Mon" (en) or "Sen" (id). */
export function weekdayShortName(i: number, l: Locale): string {
  return fmt(l, { weekday: "short" }).format(new Date(Date.UTC(2026, 0, 4 + i, 5))).replace(/\.$/, "");
}
