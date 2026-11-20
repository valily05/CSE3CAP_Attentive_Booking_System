"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowLeft, CalendarDays, CarFront, Check, CheckCircle2, Clock3, Copy, Download, Info, MapPin, MessageCircle, UserRound, Video, Zap } from "lucide-react";
import { api, errorCode } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useAppLocale } from "@/lib/i18n";
import { formatFullDateTime as formatDateTime } from "@/lib/time";
import type { UrgentReceipt } from "./types";
import styles from "./Confirmation.module.css";
import { readUrgentNotifications, saveUrgentNotification } from "@/lib/urgentNotifications";

export function UrgentConfirmation({ code = "", mode }: { code?: string; mode?: "online" | "onsite" }) {
 const t = useTranslations("urgent");
 const errors = useTranslations("errors");
 const locale = useAppLocale();
 const [receipt, setReceipt] = useState<UrgentReceipt>();
 const [token, setToken] = useState("");
 const [qr, setQr] = useState("");
 const [error, setError] = useState("");
 const [notice, setNotice] = useState("");
 const [busy, setBusy] = useState(false);
 const { data: config } = useApi<{ whatsappNumber: string }>("/api/urgent-requests/config");
 const load = useCallback(async (access: string) => {
   const result = await api.post<UrgentReceipt>("/api/urgent-requests/receipt", { token: access });
   if (code && code !== result.bookingCode) throw new Error();
   return result;
 }, [code]);
 useEffect(() => {
  let live = true;
  let access = window.location.hash.split("#")[1] || readUrgentNotifications().find(item => item.code === code)?.token || "";
  try { access ||= sessionStorage.getItem("urgent-owner-" + code) || ""; } catch { /* Fragment access works without storage. */ }
  load(access).then(async (result) => {
   const image = await QRCode.toDataURL(result.bookingCode, { width: 900, margin: 4, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
   if (live) { saveUrgentNotification(result, access); setToken(access); setReceipt(result); setQr(image); }
  }).catch((exception) => { if (live) setError(errorCode(exception)); });
  return () => { live = false; };
 }, [code, load]);
 if (!receipt) return <div className={styles.page}>
   {error ? <p role="alert">{errors(error)}</p> : <p role="status">{t("loading")}</p>}
   {error && <p>{t("savedAccessUnavailable")}</p>}
   <Link href="/">{t("back")}</Link>
 </div>;
 const onsite = receipt.sessionType === "onsite";
 const workflow = receipt.workflow;
 const message = t(onsite ? "onsiteMessage" : "onlineMessage", { code: receipt.bookingCode, name: receipt.customerName });
 const whatsapp = config?.whatsappNumber ? `https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent(message)}` : "";
 let maps = workflow.mapsUrl;
 if (!maps && workflow.address) maps = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(workflow.address);
 const confirmed = receipt.status === "CONFIRMED";
 const closed = ["COMPLETED", "CANCELLED"].includes(receipt.status);
 return <div className={styles.page}>
  <Link href="/" className={styles.back}><ArrowLeft size={19} aria-hidden="true" />{t("backHome")}</Link>
  <div className={styles.heading}>
   <span className={styles.seal}>{confirmed ? <Check size={32} aria-hidden="true" /> : <CheckCircle2 size={32} aria-hidden="true" />}</span>
   <h1>{t(confirmed ? "bookingConfirmed" : "received")}</h1>
   <p>{t(confirmed ? "bookingConfirmedBody" : "receivedBody")}</p>
  </div>
  <section className={styles.pass} aria-label={t("bookingPass")}>
   <div className={styles.ticket}>
    <h2>{t("bookingPass")}</h2>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className={styles.qr} src={qr} alt={t("qrAlt", { code: receipt.bookingCode })} width={220} height={220} />
   </div>
   <div className={styles.details}>
    <div className={styles.codeRow}><div><p>{t("reference")}</p><strong className={styles.code}>{receipt.bookingCode}</strong></div><span className={styles.badge}><Zap size={16} aria-hidden="true" />{t("badge")}</span></div>
    <dl className={styles.facts}>
     <div><UserRound aria-hidden="true" /><div><dt>{t("name")}</dt><dd>{receipt.customerName}</dd></div></div>
     <div><CheckCircle2 aria-hidden="true" /><div><dt>{t("statusLabel")}</dt><dd>{t(`statuses.${receipt.status}`)}</dd></div></div>
     <div><CalendarDays aria-hidden="true" /><div><dt>{t("session")}</dt><dd>{t(receipt.sessionType)}</dd></div></div>
     <div>{onsite ? <MapPin aria-hidden="true" /> : <Video aria-hidden="true" />}<div><dt>{t("location")}</dt><dd>{onsite ? receipt.locationName : t("online")}</dd></div></div>
     <div><Clock3 aria-hidden="true" /><div><dt>{t("submitted")}</dt><dd>{formatDateTime(workflow.submittedAt, locale)}</dd></div></div>
    </dl>
   </div>
  </section>
  <p className={styles.hint}><Info size={20} aria-hidden="true" />{t(onsite ? "passHint" : "passHintOnline")}</p>
  {receipt.recent && <p className={styles.notice}>{t("repeatSaved")}</p>}
  <section className={`${styles.panel} ${styles.visit}`} aria-labelledby="visit-steps-title">
   <h2 id="visit-steps-title">{t(onsite ? "visitTitle" : "onlineVisitTitle")}</h2><p>{t("visitBody")}</p>
   <ol className={styles.steps}>{[1,2,3].map(step => <li className={styles.step} key={step}>
    <div className={styles.art} aria-hidden="true" /><span className={styles.stepNumber} aria-hidden="true">{step}</span>
    <div className={styles.stepText}><h3>{t(`${onsite ? "visit" : "onlineVisit"}Step${step}Title`)}</h3><p>{t(`${onsite ? "visit" : "onlineVisit"}Step${step}Body`)}</p></div>
   </li>)}</ol>
  </section>
  {onsite && <section className={styles.panel} aria-labelledby="arrival-title">
   <div className={styles.etaHeading}><CarFront size={42} aria-hidden="true" /><div><h2 id="arrival-title">{t("updateEta")}</h2><p>{t("arrivalBody")}</p></div></div>
   <div className={styles.arrivalChoices} role="group" aria-label={t("arrivalChoice")}>
    {["now","10","20","30","later"].map(choice => <button type="button" key={choice} aria-pressed={workflow.arrivalStatus === choice} disabled={busy || closed} onClick={async () => {
     setBusy(true); setError(""); setNotice("");
     try { await api.post("/api/urgent-requests/arrival", { token, choice }); const updated = await load(token); setReceipt(updated); saveUrgentNotification(updated, token); setNotice(t("arrivalSaved")); }
     catch(exception) { setError(errorCode(exception)); } finally { setBusy(false); }
    }}>{t(`arrival.${choice}`)}</button>)}
   </div>
   {workflow.arrivalUpdatedAt && <div className={styles.arrivalStatus}><CheckCircle2 size={30} aria-hidden="true" /><div><strong>{t("arrivalSaved")}</strong><p>{t("updatedAt")} {formatDateTime(workflow.arrivalUpdatedAt, locale)}</p></div></div>}
   <p className={styles.disclaimer}>{t("arrivalDisclaimer")}</p>
  </section>}
  {onsite && <div className={styles.location}><strong>{receipt.locationName}</strong><p>{workflow.address || t("addressPending")}</p>{!confirmed && !closed && <p>{t("waitConfirmation")}</p>}</div>}
  <div className={styles.actions}>
   <a className={styles.action} href={qr} download={receipt.bookingCode + "-QR.png"}><Download size={26} aria-hidden="true" />{t("download")}</a>
   <button type="button" className={styles.action} onClick={async () => { try { await navigator.clipboard.writeText(receipt.bookingCode); setNotice(t("copied")); } catch { setError("internal"); } }}><Copy size={25} aria-hidden="true" />{t("copy")}</button>
   {onsite && maps && <a className={styles.action} href={maps} target="_blank" rel="noopener noreferrer"><MapPin size={26} aria-hidden="true" />{t("directions")}</a>}
   {whatsapp && <a className={styles.action} href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={26} aria-hidden="true" />{t(onsite ? "contactWhatsapp" : "continueWhatsapp")}</a>}
  </div>
  {!whatsapp && <p className={styles.footer}>{t("whatsappMissing")}</p>}
  {notice && <p role="status" className={styles.notice}>{notice}</p>}
  {error && <p role="alert" className={styles.error}>{errors(error)}</p>}
  {mode && mode !== receipt.sessionType && <p>{t("correctReceipt")}</p>}
  <p className={styles.footer}>{t("notificationSaved")}</p>
 </div>;
}
