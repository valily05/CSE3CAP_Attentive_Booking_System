"use client";

import Link from "next/link";
import {Armchair,Users,School,Video,Phone,MessageCircle,MapPin} from "lucide-react";
import {PinkyPromiseIcon} from "@/components/ui/PinkyPromiseIcon";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, errorCode } from "@/lib/api";
import { addDays, addMonths, dateKey, daysInMonth, formatDate, formatDateTime, formatTime,minutesIntoDay, todayKey } from "@/lib/time";
import { useAppLocale } from "@/lib/i18n";
import { useApi } from "@/lib/useApi";
import type { Catalog, Channel, Created, Day, Me, Psychologist, Slot } from "@/lib/types";
import { AppointmentCard } from "./AppointmentCard";
import { MonthPicker } from "./MonthPicker";
import {WaitingListBanner} from "./WaitingList";
import styles from "./BookingFlow.module.css";

type How = { mode: "online"; channel: Channel } | { mode: "in_person"; location: string };
const CHANNELS: Channel[] = ["video", "voice", "chat"];

type Props = { psychologist: Psychologist; catalog: Catalog; me: Me | null; today?: string };

/** G09-4: choose a session, how to meet, then a day on the month calendar and a time. */
export function BookingFlow({ psychologist: p, catalog, me, today = todayKey() }: Props) {
  const t = useTranslations();
  const locale = useAppLocale();
  const services = catalog.services.filter((s) => p.serviceIds.includes(s.id));
  const tomorrow = addDays(today, 1);
  const firstMonth = tomorrow.slice(0, 7);
  const [prefill]=useState(()=>{
    if(typeof window==="undefined")return null;
    const q=new URLSearchParams(window.location.search),id=q.get("service"),type=q.get("sessionType"),start=q.get("start"),location=q.get("location")||"";
    const svc=services.find(s=>s.id===id);
    if(!svc||!type||!p.sessionTypes.some(value=>value===type)||(type==="in_person"&&!p.locationIds.includes(location)))return null;
    const how:How=type==="in_person"?{mode:"in_person",location}:{mode:"online",channel:type as Channel};
    const validStart=start&&!Number.isNaN(Date.parse(start))&&dateKey(start)>=tomorrow?start:null;
    const slot:Slot|null=validStart?{Start:validStart,End:new Date(Date.parse(validStart)+svc.lengthMinutes*60000).toISOString(),Mode:how.mode,LocationID:location}:null;
    return {serviceId:svc.id,how,slot};
  });
  const [serviceId, setServiceId] = useState(prefill?.serviceId||(services.length === 1 ? services[0].id : ""));
  const [how, setHow] = useState<How | null>(prefill?.how||null);
  const [month, setMonth] = useState(() => {
    const next = prefill?.slot?dateKey(prefill.slot.Start):p.nextOpen?dateKey(p.nextOpen):tomorrow;
    return (next > tomorrow ? next : tomorrow).slice(0, 7);
  });
  const [preferredDate,setPreferredDate]=useState(prefill?.slot?dateKey(prefill.slot.Start):tomorrow);
  const [slot, setSlot] = useState<Slot | null>(prefill?.slot||null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Created | null>(null);

  const service = services.find((s) => s.id === serviceId);
  const locationName = (id: string) => catalog.locations.find((l) => l.id === id)?.name ?? id;
  const placeText = how?.mode === "online" ? t(`sessionType.${how.channel}`) : how ? locationName(how.location) : "";

  let slotsURL: string | null = null;
  if (serviceId && how) {
    const from = month === firstMonth ? tomorrow : `${month}-01`;
    const days = daysInMonth(month) - Number(from.slice(8)) + 1;
    const q = new URLSearchParams({ service: serviceId, from, days: String(days), mode: how.mode });
    if (how.mode === "in_person") q.set("location", how.location);
    slotsURL = `/api/psychologists/${p.id}/slots?${q}`;
  }
  const slots = useApi<{ days: Day[] }>(slotsURL);
  const days = slots.data?.days ?? null;
  // A chosen time only counts while it is still offered.
  const chosen = slot && days?.some((d) => d.slots.some((s) => s.Start === slot.Start)) ? slot : null;

  async function confirm() {
    if (!chosen || !how || !service) return;
    setBusy(true);
    setError(null);
    try {
      const body =
        how.mode === "online"
          ? { psychologistId: p.id, serviceId, mode: "online", onlineChannel: how.channel, start: chosen.Start }
          : { psychologistId: p.id, serviceId, mode: "in_person", locationId: how.location, start: chosen.Start };
      setDone(await api.post<Created>("/api/bookings", body));
    } catch (e) {
      setError(errorCode(e));
      setSlot(null);
      slots.reload();
    } finally {
      setBusy(false);
    }
  }

  if (done && slot) {
    return (
      <AppointmentCard
        code={done.code}
        psychologist={p.name}
        when={formatDateTime(slot.Start, locale)}
        where={placeText}
        deadline={formatDateTime(done.changeDeadline, locale)}
      />
    );
  }

  const howValue = how ? (how.mode === "online" ? `online:${how.channel}` : `in_person:${how.location}`) : "";
  const pickHow = (v: string) => {
    const [mode, x] = v.split(":");
    setHow(mode === "online" ? { mode: "online", channel: x as Channel } : { mode: "in_person", location: x });
  };
  const channels = CHANNELS.filter((c) => p.sessionTypes.includes(c));
  const places = p.sessionTypes.includes("in_person") ? p.locationIds : [];
  const shownError = error ?? slots.error;

  return (
    <div className={styles.layout}>
      <ol className={styles.steps}>
        <li className={styles.card}>
          <fieldset>
            <legend>{t("profile.step.service")}</legend>
            <div className={styles.services}>
              {services.map((s) => (
                <label key={s.id} className={styles.choice}>
                  <input type="radio" name="service" value={s.id} checked={serviceId === s.id} onChange={() => setServiceId(s.id)} />
                  <span>
                    <span className={styles.optionTitle}>{s.ageGroup==="family_couple"?<Users size={19} aria-hidden="true"/>:s.ageGroup==="child_teen"?<School size={19} aria-hidden="true"/>:<Armchair size={19} aria-hidden="true"/>}{s.name}</span>
                    <small>{t("profile.minutes", { minutes: s.lengthMinutes })}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </li>

        <li className={styles.card}>
          <fieldset>
            <legend>{t("profile.step.how")}</legend>
            <div className={styles.choices}>
              {channels.map((c) => (
                <label key={c} className={styles.choice}>
                  <input type="radio" name="how" value={`online:${c}`} checked={howValue === `online:${c}`} onChange={(e) => pickHow(e.target.value)} />
                  <span><span className={styles.optionTitle}>{c==="video"?<Video size={18} aria-hidden="true"/>:c==="voice"?<Phone size={18} aria-hidden="true"/>:<MessageCircle size={18} aria-hidden="true"/>}{t(`sessionType.${c}`)}</span></span>
                </label>
              ))}
              {places.map((l) => (
                <label key={l} className={styles.choice}>
                  <input type="radio" name="how" value={`in_person:${l}`} checked={howValue === `in_person:${l}`} onChange={(e) => pickHow(e.target.value)} />
                  <span><span className={styles.optionTitle}><MapPin size={18} aria-hidden="true"/>{locationName(l)}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
        </li>

        <li className={styles.card}>
          <section aria-labelledby="pick-date">
            <h3 id="pick-date" className={styles.stepTitle}>
              {t("profile.step.date")}
            </h3>
            <p className={styles.note}>{t("profile.leadNote")}</p>
            {serviceId && how && (
              <MonthPicker
                key={`${serviceId}-${howValue}-${month}`}
                month={month}
                days={days ?? []}
                today={today}
                selected={chosen?.Start ?? null}
                onSelect={setSlot}
                onDateChange={setPreferredDate}
                canGoBack={month > firstMonth}
                onMonth={(d) => {
                  setSlot(null);
                  setMonth(addMonths(month, d));
                }}
              />
            )}
            <WaitingListBanner psychologist={p} catalog={catalog} me={me} serviceId={serviceId} date={preferredDate} period={chosen?(minutesIntoDay(chosen.Start)<720?"morning":minutesIntoDay(chosen.Start)<1020?"afternoon":"evening"):undefined} sessionType={how?.mode==="online"?how.channel:how?"in_person":""} locationId={how?.mode==="in_person"?how.location:""}/>
          </section>
        </li>
      </ol>

      <aside aria-labelledby="summary" className={styles.summary} data-ready={chosen ? "" : undefined}>
        <h3 id="summary">{t("profile.summaryTitle")}</h3>
        <dl>
          <dt>{t("profile.with")}</dt>
          <dd>{p.name}</dd>
          <dt>{t("profile.session")}</dt>
          <dd>{service ? `${service.name}, ${t("profile.minutes", { minutes: service.lengthMinutes })}` : "–"}</dd>
          <dt>{t("profile.how")}</dt>
          <dd>{placeText || "–"}</dd>
          <dt>{t("profile.date")}</dt>
          <dd data-empty={!chosen || undefined}>{chosen ? formatDate(chosen.Start, locale) : t("profile.pickDate")}</dd>
          <dt>{t("profile.time")}</dt>
          <dd data-empty={!chosen || undefined}>{chosen ? t("profile.timeWib", { time: formatTime(chosen.Start, locale) }) : t("profile.pickTime")}</dd>
        </dl>
        {chosen && (
          // Shown only in the phone's pinned bar, where the details list is hidden.
          <p className={styles.compact} aria-hidden="true">
            {formatDateTime(chosen.Start, locale)}
          </p>
        )}
        {shownError && (
          <p role="alert" className={styles.error}>
            {t(`errors.${shownError}`)}
          </p>
        )}
        {me || !chosen ? (
          <button type="button" className="button" onClick={confirm} disabled={!chosen || busy}>
            {busy ? t("profile.confirming") : t("profile.confirm")}
          </button>
        ) : (
          <Link className="button" href={`/signin?next=${encodeURIComponent(`/psychologists/${p.id}`)}`}>
            {t("profile.signInToBook")}
          </Link>
        )}
        <p className={styles.small}>{t("profile.changeNote")}</p>
        <p className={styles.privacy}><PinkyPromiseIcon size={27} aria-hidden="true"/><span>{t("profile.privacy")}</span></p>
      </aside>
    </div>
  );
}
