"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useApi } from "@/lib/useApi";
import { api, errorCode } from "@/lib/api";
import { useAppLocale } from "@/lib/i18n";
import { formatFullDateTime as formatDateTime, todayKey } from "@/lib/time";
import { useDirectory } from "@/components/admin/useDirectory";
import type { Day } from "@/lib/types";
import type { UrgentRequest } from "./types";
import Link from "next/link";
import {ArrowLeft,ClipboardList,Users,CalendarDays,History} from "lucide-react";
import {useAdminBranch,adminHref} from "@/components/admin/AdminBranch";
import {showToast} from "@/lib/toast";
import styles from "./AdminUrgent.module.css";

type ClientHit = { id: string; name: string; email: string; phone: string };
type Activity = { action: string; at: string; actor: string };

export function UrgentDetail({ code }: { code: string }) {
 const ui=useTranslations("urgentAdminUi"),branch=useAdminBranch();
 const t = useTranslations("urgent");
 const errors = useTranslations("errors");
 const locale = useAppLocale();
 const { data, error: loadError, reload } = useApi<{ request: UrgentRequest; activity: Activity[] }>("/api/admin/urgent-requests/" + encodeURIComponent(code));
 const { catalog, psychologists } = useDirectory();
 const [clientQuery, setClientQuery] = useState("");
 const [verified, setVerified] = useState(false);
 const [consent, setConsent] = useState(false);
 const [psychId, setPsychId] = useState("");
 const [serviceId, setServiceId] = useState("");
 const [channel, setChannel] = useState("");
 const [from, setFrom] = useState(todayKey);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState("");
 const hits = useApi<{ clients: ClientHit[] }>(clientQuery.length >= 2 ? "/api/admin/clients?q=" + encodeURIComponent(clientQuery) : null);
 const request = data?.request;
 const psych = psychologists.find((item) => item.id === psychId);
 const mode = request?.sessionType === "onsite" ? "in_person" : "online";
 const slotQuery = new URLSearchParams({ service: serviceId, from, days: "7", mode, location: request?.locationId || "" });
 const slots = useApi<{ days: Day[] }>(psychId && serviceId ? `/api/psychologists/${psychId}/slots?${slotQuery}` : null);
 useEffect(() => {
  const timer = setInterval(() => { if (!document.hidden) reload(); }, 10000);
  return () => clearInterval(timer);
 }, [reload]);

 async function action(name: string, body: object = {}) {
  setBusy(true); setError("");
  try {
   await api.post("/api/admin/urgent-requests/" + code + "/" + name, body);
   reload(); showToast(t("updated"),false);
  } catch (exception) { setError(errorCode(exception));showToast(errors(errorCode(exception)),true); }
  finally { setBusy(false); }
 }
 function assign(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  void action("assign", { psychologistId: psychId, serviceId, channel: mode === "online" ? channel : "", start: fields.get("start") });
 }
 if (!request) return <p role={loadError ? "alert" : "status"}>{loadError ? errors(loadError) : t("loading")}</p>;
 const w = request.workflow;
 const terminal = ["COMPLETED", "CANCELLED"].includes(request.status);
 const eligible = psychologists.filter((item) => mode === "in_person" ? item.sessionTypes.includes("in_person") && item.locationIds.includes(request.locationId) : item.sessionTypes.some((value) => value !== "in_person"));
 return <div className={styles.admin}>
  <Link className={styles.back} href={adminHref("/admin/urgent-requests",branch)}><ArrowLeft size={16}/>{ui("back")}</Link>
  <header className={styles.detailHeading}><div><span className={styles.badge}>{t("badge")}</span><h1>{request.bookingCode}</h1><p>{ui("detailBody")}</p></div><span className={styles.status} data-status={request.status}><span/>{t(`statuses.${request.status}`)}</span></header>
  {(error || loadError) && <p role="alert" className={styles.error}>{errors(error || loadError || "internal")}</p>}
  <div className={styles.details}>
   <section className={styles.card}>
    <header className={styles.cardHeading}><span><ClipboardList size={20}/></span><div><h2>{t("originalRequest")}</h2><p>{ui("careBody")}</p></div></header>
    <dl className={styles.facts}>
     <div><dt>{t("name")}</dt><dd>{request.customerName}</dd></div>
     <div><dt>{t("email")}</dt><dd><a href={"mailto:" + request.email}>{request.email}</a></dd></div>
     {request.whatsappNumber && <div><dt>{t("phone")}</dt><dd><a href={"https://wa.me/" + request.whatsappNumber.slice(1)} target="_blank" rel="noopener noreferrer">{request.whatsappNumber}</a></dd></div>}
     <div><dt>{t("session")}</dt><dd>{t(request.sessionType)}</dd></div>
     {request.locationName && <div><dt>{t("location")}</dt><dd>{request.locationName}</dd></div>}
     <div><dt>{t("submitted")}</dt><dd>{formatDateTime(w.submittedAt, locale)}</dd></div>
     <div><dt>{t("waiting")}</dt><dd>{t("waitingMinutes", { minutes: w.waitingMinutes })}</dd></div>
     {w.arrivalStatus && <div><dt>{t("arrivalChoice")}</dt><dd>{t(`arrival.${w.arrivalStatus}`)} {w.arrivalUpdatedAt && formatDateTime(w.arrivalUpdatedAt, locale)}</dd></div>}
     {(["assignedAt", "confirmedAt", "checkedInAt", "linkedAt", "completedAt", "cancelledAt"] as const).map((key) => w[key] && <div key={key}><dt>{t(key)}</dt><dd>{formatDateTime(w[key]!, locale)}</dd></div>)}
    </dl>
    <div className={styles.actions}>
     {request.sessionType === "onsite" && <button className="button" disabled={busy || terminal || Boolean(w.checkedInAt)} onClick={() => action("check-in")}>{t("checkIn")}</button>}
     <button className="button-quiet" disabled={busy || terminal || !w.appointmentId} onClick={() => action("complete")}>{t("complete")}</button>
     <button className="button-danger" disabled={busy || terminal} onClick={() => { if (window.confirm(t("cancelConfirm"))) void action("cancel"); }}>{t("cancel")}</button>
    </div>
    <label className="field"><span>{t("readinessLabel")}</span><select aria-label={t("readinessLabel")} value={w.readiness} disabled={busy || terminal || !w.psychologistId} onChange={(event) => action("readiness", { value: event.target.value })}>
     {["awaiting", "ready", "unavailable"].map((value) => <option key={value} value={value}>{t(`readiness.${value}`)}</option>)}
    </select></label>
    {request.locationId && <details><summary>{t("locationDetails")}</summary>
     <form onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError("");
      const fields = new FormData(event.currentTarget);
      try {
       await api.put("/api/admin/urgent-locations/" + request.locationId, { address: fields.get("address"), mapsUrl: fields.get("maps"), verified: fields.get("verified") === "on" });
       reload(); showToast(t("updated"),false);
      } catch (exception) { setError(errorCode(exception)); } finally { setBusy(false); }
     }}>
      <label className="field"><span>{t("address")}</span><input name="address" defaultValue={w.address} required maxLength={1000} /></label>
      <label className="field"><span>{t("mapsUrl")}</span><input name="maps" type="url" defaultValue={w.mapsUrl} maxLength={2000} /></label>
      <label className={styles.ack}><input name="verified" type="checkbox" required /><span>{t("locationVerified")}</span></label>
      <button className="button-quiet" disabled={busy}>{t("saveLocation")}</button>
     </form>
    </details>}
   </section>
   <section className={styles.card}>
    <header className={styles.cardHeading}><span><Users size={20}/></span><div><h2>{t("linkClient")}</h2><p>{ui("linkBody")}</p></div></header>
    <label className={styles.ack}><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} /><span>{t("identityVerified")}</span></label>
    {w.clientId && <p>{t("linkedClient", { name: w.clientName || "", email: w.clientEmail || "" })}</p>}
    <>
     <form onSubmit={(event) => { event.preventDefault(); setClientQuery(String(new FormData(event.currentTarget).get("query")).trim()); }}>
      <label className="field"><span>{t("clientSearch")}</span><input name="query" minLength={2} required /></label>
      <button className="button-quiet">{t("search")}</button>
     </form>
     {hits.error && <p role="alert">{errors(hits.error)}</p>}
     <ul className={styles.list}>{hits.data?.clients.map((client) => <li key={client.id}>
      <p>{client.name} · {client.email} · {client.phone}</p>
      <button className="button-quiet" disabled={!verified || busy} onClick={() => {
       if (!w.clientId || w.clientId === client.id || window.confirm(t("relinkConfirm"))) void action("link-client", { value: client.id, verified });
      }}>{t("linkThisClient")}</button>
     </li>)}</ul>
     {!w.clientId && <button className="button-quiet" disabled={!verified || busy || terminal} onClick={() => action("guest-client", { verified })}>{t("createGuest")}</button>}
    </>
    {w.clientId && <>
     <label className={styles.ack}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>{t("accessConsent")}</span></label>
     <button className="button-quiet" disabled={!verified || !consent || busy} onClick={() => action("invite", { verified, consent, locale })}>{t("invite")}</button>
     <form onSubmit={(event) => {
      event.preventDefault();
      void action("change-email", { email: new FormData(event.currentTarget).get("email"), consent, verified, locale });
     }}>
      <label className="field"><span>{t("newEmail")}</span><input name="email" type="email" required /></label>
      <button className="button-quiet" disabled={!verified || !consent || busy}>{t("verifyNewEmail")}</button>
     </form>
    </>}
   </section>
   <section className={styles.card}>
    <header className={styles.cardHeading}><span><CalendarDays size={20}/></span><div><h2>{t("assignment")}</h2><p>{ui("assignBody")}</p></div></header>
    {w.psychologistId && <p>{psychologists.find((item) => item.id === w.psychologistId)?.name} {w.start && formatDateTime(w.start, locale)}</p>}
    <form onSubmit={assign}>
     <label className="field"><span>{t("psychologist")}</span><select aria-label={t("psychologist")} value={psychId} onChange={(event) => { setPsychId(event.target.value); setServiceId(""); setChannel(""); }} required>
      <option value="">{t("choosePsychologist")}</option>{eligible.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
     </select></label>
     <label className="field"><span>{t("service")}</span><select aria-label={t("service")} value={serviceId} onChange={(event) => setServiceId(event.target.value)} required>
      <option value="">{t("chooseService")}</option>{catalog.services.filter((service) => psych?.serviceIds.includes(service.id)).map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
     </select></label>
     {mode === "online" && <label className="field"><span>{t("channel")}</span><select aria-label={t("channel")} value={channel} onChange={(event) => setChannel(event.target.value)} required><option value="">{t("chooseChannel")}</option>{psych?.sessionTypes.filter((value) => value !== "in_person").map((value) => <option key={value} value={value}>{t(`channels.${value}`)}</option>)}</select></label>}
     <label className="field"><span>{t("starting")}</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} required /></label>
     <label className="field"><span>{t("availableSlot")}</span><select aria-label={t("availableSlot")} name="start" required key={psychId + serviceId + from} defaultValue="">
      <option value="">{t("chooseSlot")}</option>{slots.data?.days.flatMap((day) => day.slots.map((slot) => <option key={slot.Start} value={slot.Start}>{formatDateTime(slot.Start, locale)}</option>))}
     </select></label>
     {slots.error && <p role="alert">{errors(slots.error)}</p>}
     <button className="button-quiet" disabled={busy || terminal || Boolean(w.appointmentId)}>{t("assign")}</button>
    </form>
    <button className="button" disabled={busy || terminal || !w.clientId || !w.start || request.status !== "ASSIGNED"} onClick={() => action("confirm")}>{t("confirmSchedule")}</button>
    <p className={styles.muted}>{t("assignmentHint")}</p>
   </section>
   <section className={styles.card}>
    <header className={styles.cardHeading}><span><History size={20}/></span><div><h2>{t("activityTitle")}</h2><p>{ui("activityBody")}</p></div></header>
    {!data?.activity.length&&<p className={styles.muted}>{ui("noActivity")}</p>}<ol className={styles.timeline}>{data?.activity.map((entry, index) => <li key={entry.at + index}>
     <p>{t.has("events." + entry.action) ? t("events." + entry.action) : t("updated")}</p>
     <p>{formatDateTime(entry.at, locale)} · {entry.actor === "customer" || entry.actor === "system" ? t("actors." + entry.actor) : entry.actor}</p>
    </li>)}</ol>
   </section>
  </div>
 </div>;
}
