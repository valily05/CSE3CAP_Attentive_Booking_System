"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api, errorCode } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import {
  addDays,
  addMonths,
  dateKey,
  daysInMonth,
  formatDate,
  formatDateTime,
  formatMonth,
  formatMonthShort,
  formatTime,
  formatWeekdayShort,
  relativeDay,
  weekStart,
} from "@/lib/time";
import { useAppLocale } from "@/lib/i18n";
import type { Booking, Day, Slot } from "@/lib/types";
import { MonthPicker } from "@/components/booking/MonthPicker";
import styles from "./MyBookings.module.css";

const REASONS = ["schedule_conflict", "travel", "cost", "other"] as const;

type Props = { now?: Date; attendCode?: string };

export function MyBookings({ now = new Date(), attendCode }: Props) {
  const t = useTranslations();
  const res = useApi<{ bookings: Booking[] }>("/api/me/bookings");
  const list = res.data?.bookings ?? null;
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError ?? res.error ?? null;

  const done = async (message: string) => {
    setNotice(message);
    setError(null);
    res.reload();
  };

  const nowMs = now.getTime();
  const byStart = [...(list ?? [])].sort((a, z) => a.start.localeCompare(z.start));
  const upcoming = byStart.filter((b) => b.status === "confirmed" && new Date(b.start).getTime() > nowMs);
  const past = byStart.filter((b) => !upcoming.includes(b)).reverse();

  return (
    <div className={styles.page}>
      {attendCode && list?.some((b) => b.code === attendCode) && <p className={styles.thanks}>{t("bookings.attendThanks")}</p>}
      <p role="status" className={styles.notice}>
        {notice}
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {t(`errors.${error}`)}
        </p>
      )}
      {list === null && !error && <p>{t("common.loading")}</p>}

      <div className={styles.columns}>
      <section aria-labelledby="upcoming" className={styles.upcomingCol}>
        <h2 id="upcoming">{t("bookings.upcoming")}</h2>
        {list && upcoming.length === 0 && (
          <p className={styles.empty}>
            {t("bookings.emptyUpcoming")}{" "}
            <Link href="/">{t("bookings.bookOne")}</Link>
          </p>
        )}
        {upcoming.length > 0 && (
          <ul className={styles.list}>
            <Upcoming key={upcoming[0].id} booking={upcoming[0]} onDone={done} onError={setError} featured now={now} />
          </ul>
        )}
        {upcoming.length > 1 && <h3 className={styles.subhead}>{t("bookings.later")}</h3>}
        <ul className={styles.list}>
          {upcoming.slice(1).map((b) => (
            <Upcoming key={b.id} booking={b} onDone={done} onError={setError} now={now} />
          ))}
        </ul>
      </section>
      {list && <SessionsCalendar bookings={byStart} now={now} />}
      </div>

      <section aria-labelledby="past" className={styles.card}>
        <h2 id="past">{t("bookings.past")}</h2>
        {list && past.length === 0 && <p className={styles.empty}>{t("bookings.emptyPast")}</p>}
        {past.length > 0 && <PastTable bookings={past} />}
      </section>
    </div>
  );
}

const shortName = (full: string) => {
  const [first, last] = full.split(/\s+/);
  return last ? `${first} ${last[0]}.` : first;
};

/** Every session on a month calendar, coloured by status (G09-7 visit history). */
function SessionsCalendar({ bookings, now }: { bookings: Booking[]; now: Date }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const [month, setMonth] = useState(dateKey(now).slice(0, 7));
  const today = dateKey(now);
  const gridStart = weekStart(`${month}-01`);
  const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const cells: string[] = [];
  for (let k = gridStart; k <= last || cells.length % 7 !== 0; k = addDays(k, 1)) cells.push(k);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const label = formatMonth(month, locale);
  return (
    <section aria-label={label} className={`${styles.card} ${styles.calendar}`}>
      <div className={styles.calHead}>
        <h2>{label}</h2>
        <div className={styles.calNav}>
          <button type="button" className="button-quiet" aria-label={t("band.prevMonth")} onClick={() => setMonth(addMonths(month, -1))}>
            ‹
          </button>
          <button type="button" className="button-quiet" onClick={() => setMonth(today.slice(0, 7))}>
            {t("psy.today")}
          </button>
          <button type="button" className="button-quiet" aria-label={t("band.nextMonth")} onClick={() => setMonth(addMonths(month, 1))}>
            ›
          </button>
        </div>
      </div>
      <div role="grid" aria-label={t("bookings.calendarLabel", { month: label })} className={styles.grid}>
        <div role="row" className={styles.gridRow}>
          {cells.slice(0, 7).map((k) => (
            <span key={k} role="columnheader" className={styles.weekday}>
              {formatWeekdayShort(`${k}T05:00:00Z`, locale)}
            </span>
          ))}
        </div>
        {weeks.map((w) => (
          <div role="row" key={w[0]} className={styles.gridRow}>
            {w.map((k) => (
              <div role="gridcell" key={k} className={styles.cell} data-outside={!k.startsWith(month) || undefined}>
                <span className={styles.cellNum} data-today={k === today || undefined}>
                  {Number(k.slice(8))}
                </span>
                {bookings
                  .filter((b) => dateKey(b.start) === k)
                  .map((b) => (
                    <span key={b.id} className={styles.chip} data-status={b.status}>
                      {formatTime(b.start, locale)} {shortName(b.psychologistName)}
                    </span>
                  ))}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className={styles.legend} aria-hidden="true">
        {(["confirmed", "attended", "no_show", "cancelled"] as const).map((s) => (
          <span key={s} data-status={s}>
            {t(`bookings.status.${s}`)}
          </span>
        ))}
      </div>
    </section>
  );
}

function PastTable({ bookings }: { bookings: Booking[] }) {
  const t = useTranslations();
  const locale = useAppLocale();
  return (
    <div className={styles.tableWrap}>
      <table aria-labelledby="past" className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t("bookings.colDate")}</th>
            <th scope="col">{t("bookings.colWith")}</th>
            <th scope="col">{t("bookings.colSession")}</th>
            <th scope="col">{t("bookings.colStatus")}</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id}>
              <td>
                {formatDate(b.start, locale)}, {formatTime(b.start, locale)}
              </td>
              <td>{b.psychologistName}</td>
              <td>
                {b.serviceName}, {b.mode === "online" ? t(`sessionType.${b.onlineChannel ?? "video"}`) : b.locationName}
              </td>
              <td>
                <span className={styles.status} data-status={b.status}>
                  {t(`bookings.status.${b.status}`)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The next session, shown as a ticket: what matters most is when, and with whom. */
function NextSession({ booking: b, now }: { booking: Booking; now: Date }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const place = b.mode === "online" ? t(`sessionType.${b.onlineChannel ?? "video"}`) : b.locationName;
  return (
    <section aria-labelledby={`next-${b.id}`} className={styles.ticket}>
      <div className={styles.dateTile} aria-hidden="true">
        <span>{formatWeekdayShort(b.start, locale)}</span>
        <strong>{Number(dateKey(b.start).slice(8))}</strong>
        <span>{formatMonthShort(b.start, locale)}</span>
      </div>
      <div className={styles.ticketBody}>
      <h3 id={`next-${b.id}`} className={styles.ticketTitle}>
        {t("bookings.next")}
      </h3>
      <p className={styles.relative}>{relativeDay(b.start, now, locale)}</p>
      <p className={styles.ticketWhen}>
        {formatDate(b.start, locale)}
        <strong>{formatTime(b.start, locale)}</strong>
      </p>
      <p className={styles.ticketWho}>{b.psychologistName}</p>
      <p className={styles.ticketMeta}>
        {b.serviceName}, {place}
      </p>
      <span className={styles.code}>{b.code}</span>
      </div>
    </section>
  );
}

function Summary({ booking: b }: { booking: Booking }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const place = b.mode === "online" ? t(`sessionType.${b.onlineChannel ?? "video"}`) : b.locationName;
  return (
    <div className={styles.summary}>
      <span className={styles.when}>
        {formatDate(b.start, locale)}
        <strong>{formatTime(b.start, locale)}</strong>
      </span>
      <span>
        {b.psychologistName}, {b.serviceName}, {place}
      </span>
      <span className={styles.meta}>
        <span className={styles.code}>{b.code}</span>
        <span className={styles.status} data-status={b.status}>
          {t(`bookings.status.${b.status}`)}
        </span>
      </span>
    </div>
  );
}

type RowProps = { booking: Booking; onDone: (msg: string) => Promise<void>; onError: (code: string) => void; featured?: boolean; now?: Date };

function Upcoming({ booking: b, onDone, onError, featured, now }: RowProps) {
  const t = useTranslations();
  const locale = useAppLocale();
  const [mode, setMode] = useState<"idle" | "cancel" | "move">("idle");

  async function move(s: Slot) {
    try {
      await api.post(`/api/bookings/${b.id}/reschedule`, { start: s.Start });
      setMode("idle");
      await onDone(t("bookings.moved", { date: formatDate(s.Start, locale), time: formatTime(s.Start, locale) }));
    } catch (e) {
      onError(errorCode(e));
    }
  }

  return (
    <li className={featured ? styles.featured : styles.row}>
      {featured ? <NextSession booking={b} now={now ?? new Date()} /> : <Summary booking={b} />}
      {b.canChange ? (
        <>
          {b.changeDeadline && <p className={styles.deadline}>{t("bookings.changeUntil", { deadline: formatDateTime(b.changeDeadline, locale) })}</p>}
          <div className={styles.actions}>
            <button type="button" className="button-quiet" onClick={() => setMode("move")}>
              {t("bookings.reschedule")}
            </button>
            <button type="button" className="button-quiet" onClick={() => setMode("cancel")}>
              {t("bookings.cancel")}
            </button>
          </div>
        </>
      ) : (
        <p className={styles.closed}>{t("bookings.contactAdmin")}</p>
      )}
      {mode === "move" && (
        <div className={styles.move}>
          <h3>{t("bookings.pickNewTime")}</h3>
          <Reschedule booking={b} today={dateKey(now ?? new Date())} onPick={move} />
        </div>
      )}
      {mode === "cancel" && (
        <CancelDialog
          onClose={() => setMode("idle")}
          onConfirm={async (reason) => {
            try {
              await api.post(`/api/bookings/${b.id}/cancel`, { reason });
              setMode("idle");
              await onDone(t("bookings.cancelled"));
            } catch (e) {
              onError(errorCode(e));
            }
          }}
        />
      )}
    </li>
  );
}

/** The same month calendar as booking, for the booking's psychologist, service and place. */
function Reschedule({ booking: b, today, onPick }: { booking: Booking; today: string; onPick: (s: Slot) => void }) {
  const tomorrow = addDays(today, 1);
  const firstMonth = tomorrow.slice(0, 7);
  const [month, setMonth] = useState(firstMonth);
  const from = month === firstMonth ? tomorrow : `${month}-01`;
  const q = new URLSearchParams({ service: b.serviceId, from, days: String(daysInMonth(month) - Number(from.slice(8)) + 1), mode: b.mode });
  if (b.mode === "in_person" && b.locationId) q.set("location", b.locationId);
  const res = useApi<{ days: Day[] }>(`/api/psychologists/${b.psychologistId}/slots?${q}`);
  return (
    <MonthPicker
      key={month}
      month={month}
      days={res.data?.days ?? []}
      today={today}
      selected={null}
      onSelect={onPick}
      canGoBack={month > firstMonth}
      onMonth={(d) => setMonth(addMonths(month, d))}
    />
  );
}

function CancelDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const t = useTranslations("bookings");
  const titleId = useId();
  const [reason, setReason] = useState("");
  const first = useRef<HTMLSelectElement>(null);
  useEffect(() => first.current?.focus(), []);

  return (
    <div className={styles.scrim} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.dialog}>
        <h3 id={titleId}>{t("cancelTitle")}</h3>
        <p>{t("cancelBody")}</p>
        <label className="field">
          <span>{t("reasonLabel")}</span>
          <select ref={first} value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">{t("reason.none")}</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`reason.${r}`)}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.actions}>
          <button type="button" className="button-danger" onClick={() => onConfirm(reason)}>
            {t("confirmCancel")}
          </button>
          <button type="button" className="button-quiet" onClick={onClose}>
            {t("keep")}
          </button>
        </div>
      </div>
    </div>
  );
}
