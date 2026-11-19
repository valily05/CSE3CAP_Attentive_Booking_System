"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, errorCode } from "@/lib/api";
import { addDays, addMonths, dateKey, daysInMonth, formatDate, formatDateTime, formatTime, todayKey } from "@/lib/time";
import { useAppLocale } from "@/lib/i18n";
import { useApi } from "@/lib/useApi";
import type { Catalog, Channel, Created, Day, Me, Psychologist, Slot } from "@/lib/types";
import { AppointmentCard } from "./AppointmentCard";
import { MonthPicker } from "./MonthPicker";
import styles from "./BookingFlow.module.css";

type How = { mode: "online"; channel: Channel } | { mode: "in_person"; location: string };
const CHANNELS: Channel[] = ["video", "voice", "chat"];

type Props = { psychologist: Psychologist; catalog: Catalog; me: Me | null; today?: string };

/** G09-4: choose a session, how to meet, then a day on the month calendar and a time. */
export function BookingFlow({ psychologist: p, catalog, me, today = todayKey() }: Props) {
  const t = useTranslations();
  const locale = useAppLocale();
  const services = catalog.services.filter((s) => p.serviceIds.includes(s.id));
  const [serviceId, setServiceId] = useState(services.length === 1 ? services[0].id : "");
  const [how, setHow] = useState<How | null>(null);
  const tomorrow = addDays(today, 1);
  const firstMonth = tomorrow.slice(0, 7);
  // Open on the month of the psychologist's next open time, never before tomorrow.
  const [month, setMonth] = useState(() => {
    const next = p.nextOpen ? dateKey(p.nextOpen) : tomorrow;
    return (next > tomorrow ? next : tomorrow).slice(0, 7);
  });
  const [slot, setSlot] = useState<Slot | null>(null);
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
                    {s.name}
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
                  <span>{t(`sessionType.${c}`)}</span>
                </label>
              ))}
              {places.map((l) => (
                <label key={l} className={styles.choice}>
                  <input type="radio" name="how" value={`in_person:${l}`} checked={howValue === `in_person:${l}`} onChange={(e) => pickHow(e.target.value)} />
                  <span>{locationName(l)}</span>
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
                canGoBack={month > firstMonth}
                onMonth={(d) => {
                  setSlot(null);
                  setMonth(addMonths(month, d));
                }}
              />
            )}
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
        <p className={styles.privacy}>{t("profile.privacy")}</p>
      </aside>
    </div>
  );
}
