"use client";
import { UrgentBadge } from "@/components/urgent/UrgentBadge";

import {showToast} from "@/lib/toast";
import Link from "next/link";
import Image from "next/image";
import { useCallback,useState } from "react";
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
import type { Booking, Slot } from "@/lib/types";
import {Reschedule} from "./BookingActions";
import {BookingDetailsDrawer} from "./BookingDetailsDrawer";
import {CalendarHeart,Eye,UserRound} from "lucide-react";
import styles from "./MyBookings.module.css";



type Props = { now?: Date; attendCode?: string };

export function MyBookings({ now = new Date(), attendCode }: Props) {
  const t = useTranslations();
  const res = useApi<{ bookings: Booking[] }>("/api/me/bookings");
  const list = res.data?.bookings ?? null;
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const closeDetails=useCallback(()=>setSelectedId(null),[]);
  const selected=list?.find(b=>b.id===selectedId);
  const setError=(code:string|null)=>{if(code)showToast(t(`errors.${code}`),true)};
  const error = res.error ?? null;

  const done = async (message: string) => {
    showToast(message);
    setError(null);
    res.reload();
    window.dispatchEvent(new Event("attentive:bookings-changed"));
  };

  const nowMs = now.getTime();
  const byStart = [...(list ?? [])].filter(b=>["confirmed","attended","no_show","cancelled"].includes(b.status)).sort((a, z) => a.start.localeCompare(z.start));
  const upcoming = byStart.filter((b) => b.status === "confirmed" && new Date(b.start).getTime() > nowMs);


  return (
    <div className={styles.page}>
      {attendCode && list?.some((b) => b.code === attendCode) && <p className={styles.thanks}>{t("bookings.attendThanks")}</p>}

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
          <div className={styles.emptyCard}><span className={styles.emptyArt}><CalendarHeart size={42} strokeWidth={1.3}/></span><h3>{t("bookingDetails.emptyTitle")}</h3><p>{t("bookingDetails.emptyBody")}</p><Link className="button" href="/">{t("bookingDetails.findTime")}</Link></div>
        )}
        {upcoming.length > 0 && (
          <ul className={styles.list}>
            <Upcoming key={upcoming[0].id} booking={upcoming[0]} onDone={done} onError={setError} onDetails={()=>setSelectedId(upcoming[0].id)} featured now={now} />
          </ul>
        )}
        {upcoming.length > 1 && <h3 className={styles.subhead}>{t("bookings.later")}</h3>}
        <ul className={styles.list}>
          {upcoming.slice(1).map((b) => (
            <Upcoming key={b.id} booking={b} onDone={done} onError={setError} onDetails={()=>setSelectedId(b.id)} now={now} />
          ))}
        </ul>
      </section>
      <div className={styles.calendarPane}>{list && <SessionsCalendar bookings={byStart} now={now} onDetails={b=>setSelectedId(b.id)}/>}
      {selected&&<BookingDetailsDrawer key={selected.id} booking={selected} onClose={closeDetails} onDone={done} onError={setError} now={now}/>}</div>
      </div>


    </div>
  );
}

const shortName = (full: string) => {
  const [first, last] = full.split(/\s+/);
  return last ? `${first} ${last[0]}.` : first;
};

/** Every session on a month calendar, coloured by status (G09-7 visit history). */
function SessionsCalendar({ bookings, now,onDetails }: { bookings: Booking[]; now: Date;onDetails:(booking:Booking)=>void }) {
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
                    <button type="button" key={b.id} className={styles.chip} data-status={b.status} aria-label={t("bookingDetails.viewBooking",{code:b.code})} onClick={()=>onDetails(b)}>
                      {formatTime(b.start, locale)} {shortName(b.psychologistName)}
                    </button>
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
      <div className={styles.cardPsych}>{b.psychologistPhoto?<Image src={b.psychologistPhoto} alt="" width={44} height={44} unoptimized/>:<span><UserRound size={23}/></span>}<p className={styles.ticketWho}>{b.psychologistName}</p></div>
      <p className={styles.ticketMeta}>
        {b.serviceName}, {place}
      </p>
      <div className={styles.meta}><span className={styles.code}>{b.code}</span><span className={styles.status} data-status={b.status}>{t(`bookings.status.${b.status}`)}</span><UrgentBadge urgent={b.isUrgent}/></div>
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
        <span className={styles.code}>{b.code}</span><UrgentBadge urgent={b.isUrgent} />
        <span className={styles.status} data-status={b.status}>
          {t(`bookings.status.${b.status}`)}
        </span>
      </span>
    </div>
  );
}

type RowProps = { booking: Booking; onDone: (msg: string) => Promise<void>; onError: (code: string) => void; onDetails:()=>void;featured?: boolean; now?: Date };

function Upcoming({ booking: b, onDone, onError,onDetails, featured, now }: RowProps) {
  const t = useTranslations();
  const locale = useAppLocale();
  const [mode, setMode] = useState<"idle" | "move">("idle");

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
            <button type="button" className="button" onClick={() => setMode("move")}>
              {t("bookings.reschedule")}
            </button>
            <button type="button" className="button-quiet" onClick={onDetails}><Eye size={16}/>{t("bookingDetails.view")}</button>
          </div>
        </>
      ) : (
        <><p className={styles.closed}>{t("bookings.contactAdmin")}</p><button type="button" className="button-quiet" onClick={onDetails}>{t("bookingDetails.view")}</button></>
      )}
      {mode === "move" && (
        <div className={styles.move}>
          <h3>{t("bookings.pickNewTime")}</h3>
          <Reschedule booking={b} today={dateKey(now ?? new Date())} onPick={move} />
        </div>
      )}

    </li>
  );
}
