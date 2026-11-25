"use client";
import { UrgentBadge } from "@/components/urgent/UrgentBadge";

import {showToast} from "@/lib/toast";
import Link from "next/link";
import { useCallback,useEffect,useState } from "react";
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
  formatTime12,
  formatWeekdayShort,
  relativeDay,
  weekStart,
} from "@/lib/time";
import { useAppLocale } from "@/lib/i18n";
import type { Booking, Slot } from "@/lib/types";
import {Reschedule} from "./BookingActions";
import {BookingDetailsDrawer} from "./BookingDetailsDrawer";
import {CalendarHeart,CalendarClock,Clock3,Armchair,Phone,Video,MapPin,Info,Eye,X} from "lucide-react";
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
    showToast(message,false,message===t("bookings.cancelled")?"cancel":"calendar");
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
      <section aria-labelledby="upcoming" className={styles.upcomingCol}><h2 id="upcoming">{t("bookings.upcoming")}</h2>
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
  const [initialTarget]=useState(()=>bookings.find(b=>b.status==="confirmed"&&Date.parse(b.start)>now.getTime())?.start||null);
  const [focusActive,setFocusActive]=useState(Boolean(initialTarget));
  useEffect(()=>{if(!initialTarget)return;const timer=setTimeout(()=>setFocusActive(false),4000);return()=>clearTimeout(timer)},[initialTarget]);
  const [month, setMonth] = useState(()=>dateKey(initialTarget||now).slice(0, 7));
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
              <div role="gridcell" key={k} className={styles.cell} data-booking-focus={focusActive&&initialTarget&&dateKey(initialTarget)===k||undefined} data-outside={!k.startsWith(month) || undefined}>
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

/** Shared session ticket keeps upcoming and later appointments visually consistent. */
function SessionSummary({booking:b,now,featured=false}:{booking:Booking;now?:Date;featured?:boolean}){
 const t=useTranslations(),locale=useAppLocale();
 const place=b.mode==="online"?t(`sessionType.${b.onlineChannel||"video"}`):b.locationName;
 const MeetingIcon=b.mode!=="online"?MapPin:b.onlineChannel==="voice"?Phone:Video;
 return <section aria-labelledby={featured?`next-${b.id}`:undefined} className={styles.ticket+(featured?"":" "+styles.laterSummary)}>
 <BookingDateTile start={b.start}/><div className={styles.ticketBody}>
 {featured&&<><h3 id={`next-${b.id}`} className={styles.ticketTitle}><CalendarClock size={18}/>{t("bookings.next")}</h3><p className={styles.relative}>{relativeDay(b.start,now||new Date(),locale)}</p></>}
 <p className={styles.ticketWhen}><Clock3 size={20}/><span>{formatDate(b.start,locale)}, <strong>{formatTime12(b.start)}</strong></span></p>
 <p className={styles.ticketWho}>{t("bookingDetails.psychologist")}: <span>{b.psychologistName}</span></p>
 <div className={styles.serviceStrip}><span><Armchair size={21}/>{b.serviceName}</span><span><MeetingIcon size={21}/>{place}</span></div>
 <div className={styles.meta}><span className={styles.code+" "+styles.bookingReference}>{b.code}</span><UrgentBadge urgent={b.isUrgent}/></div>
 </div></section>
}
function BookingDateTile({start}:{start:string}){const locale=useAppLocale();return <div className={styles.dateTile} aria-hidden="true"><span>{formatWeekdayShort(start,locale)}</span><strong>{Number(dateKey(start).slice(8))}</strong><span>{formatMonthShort(start,locale)}</span></div>}

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
      <SessionSummary booking={b} now={now} featured={featured}/>
      {b.canChange ? (
        <>
          {b.changeDeadline && <p className={styles.deadline}><Info size={17}/>{t("bookings.changeUntil", { deadline: formatDateTime(b.changeDeadline, locale) })}</p>}
          <div className={styles.actions}>
            <button type="button" className="button" onClick={() => setMode("move")}>
              {t("bookings.reschedule")}
            </button>
            <button type="button" className={"button-quiet "+styles.viewDetails} onClick={onDetails}><Eye size={16}/>{t("bookingDetails.view")}</button>
          </div>
        </>
      ) : (
        <><p className={styles.closed}>{t("bookings.contactAdmin")}</p><button type="button" className="button-quiet" onClick={onDetails}>{t("bookingDetails.view")}</button></>
      )}
      {mode === "move" && (
        <div className={styles.move}>
          <div className={styles.moveHeading}><h3>{t("bookings.pickNewTime")}</h3><button type="button" aria-label={t("bookingDetails.closeChange")} onClick={()=>setMode("idle")}><X size={18}/></button></div>
          <Reschedule booking={b} today={dateKey(now ?? new Date())} onPick={move} />
        </div>
      )}

    </li>
  );
}
