"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useApi } from "@/lib/useApi";
import { formatFullDateTime as formatDateTime } from "@/lib/time";
import { useAppLocale } from "@/lib/i18n";
import { urgentStatuses, type UrgentRequest } from "./types";
import styles from "./Urgent.module.css";

type QRDetector = { detect: (video: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorConstructor = new (options: { formats: string[] }) => QRDetector;

export function UrgentAdmin({ verify = false }: { verify?: boolean }) {
  const t = useTranslations("urgent");
  const errors = useTranslations("errors");
  const locale = useAppLocale();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState("");
  const [location, setLocation] = useState("");
  const [lookup, setLookup] = useState(verify ? null : "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [scanning, setScanning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const { data, error: loadError, reload } = useApi<{ requests: UrgentRequest[]; counts?: Record<string, number>; remainingCodes?: number; offset?: number; hasMore?: boolean }>(lookup === null ? null : "/api/admin/urgent-requests" + lookup);
  const { data: catalog } = useApi<{ locations: { id: string; name: string }[] }>("/api/catalog");
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) reload(); }, 10000);
    return () => clearInterval(timer);
  }, [reload]);
  useEffect(() => {
    let live = true;
    if (verify) {
      Promise.resolve(window.location.hash.slice(1)).then((code) => {
        if (live) setLookup(/^ATT\d{4}$/.test(code) ? "?q=" + code : "");
      });
    }
    return () => { live = false; };
  }, [verify]);

  function find(value: string) {
    const trimmed = value.trim();
    if (/^ATT\d{4}$/i.test(trimmed)) { setQuery(trimmed.toUpperCase()); setLookup("?q=" + trimmed.toUpperCase()); return; }
    setError("bad_request");
  }

  useEffect(() => {
    if (!scanning) return;
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout>;
    async function scan() {
      try {
        const Detector = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
        if (!Detector) { setNotice(t("cameraFallback")); setScanning(false); return; }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) { stream.getTracks().forEach((track) => track.stop()); return; }
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const detector = new Detector({ formats: ["qr_code"] });
        async function tick() {
          if (stopped || !video.current) return;
          try {
            const results = await detector.detect(video.current);
            if (results.length) { find(results[0].rawValue); setScanning(false); return; }
            timer = setTimeout(tick, 300);
          } catch { setNotice(t("cameraFallback")); setScanning(false); }
        }
        await tick();
      } catch { setNotice(t("cameraFallback")); setScanning(false); }
    }
    void scan();
    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach((track) => track.stop()); };
  }, [scanning, t]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    setLookup("?" + new URLSearchParams({ q: query, status, mode, location }).toString());
  }
  return (
    <div className={styles.admin}>
      <h1>{t("adminTitle")}</h1>
      <div className={styles.summary}>
        {["PENDING", "checkedIn", "ASSIGNED", "CONFIRMED"].map((key) => <div key={key}><span>{t(key === "checkedIn" ? "checkedInCount" : `summary.${key}`)}</span><strong>{data?.counts?.[key] ?? 0}</strong></div>)}
      </div>
      {data?.remainingCodes !== undefined && <p>{t("capacity", { remaining: data.remainingCodes })}</p>}
      {data?.remainingCodes !== undefined && data.remainingCodes < 1000 && <p className={styles.warning}>{t("capacityWarning")}</p>}
      <form onSubmit={search}>
        <label className="field"><span>{t("searchLabel")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={254} /></label>
        <label className="field"><span>{t("statusLabel")}</span><select aria-label={t("statusLabel")} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">{t("all")}</option>{urgentStatuses.map((value) => <option key={value} value={value}>{t(`statuses.${value}`)}</option>)}</select></label>
        <label className="field"><span>{t("session")}</span><select aria-label={t("session")} value={mode} onChange={(event) => setMode(event.target.value)}><option value="">{t("all")}</option><option value="online">{t("online")}</option><option value="onsite">{t("onsite")}</option></select></label>
        <label className="field"><span>{t("location")}</span><select aria-label={t("location")} value={location} onChange={(event) => setLocation(event.target.value)}><option value="">{t("all")}</option>{catalog?.locations.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}</select></label>
        <button className="button">{t("search")}</button>
        <button type="button" className="button-quiet" onClick={() => { setLookup(""); reload(); }}>{t("showAll")}</button>
        <button type="button" className="button-quiet" onClick={() => setScanning(!scanning)}>{t(scanning ? "stopScan" : "scan")}</button>
      </form>
      {scanning && <video ref={video} className={styles.video} muted playsInline aria-label={t("scan")} />}
      {notice && <p role="status">{notice}</p>}
      {(error || loadError) && <p role="alert" className={styles.error}>{errors(error || loadError || "internal")}</p>}
      {!data && !loadError && <p role="status">{t("loading")}</p>}
      {data?.requests.length === 0 && <p>{t("noRequests")}</p>}
      <div className={styles.tableScroll}>
        <table className={styles.queue}>
          <thead><tr>{["reference", "name", "email", "phone", "session", "location", "submitted", "statusLabel", "arrivalChoice", "openDetails"].map((key) => <th key={key} scope="col">{t(key)}</th>)}</tr></thead>
          <tbody>{data?.requests.map((request) => <tr key={request.id}>
            <td data-label={t("reference")}><div><span className={styles.badge}>{t("badge")}</span><p><Link href={"/admin/urgent-requests/" + request.bookingCode}>{request.bookingCode}</Link></p></div></td>
            <td data-label={t("name")}>{request.customerName}</td>
            <td data-label={t("email")}><a href={"mailto:" + request.email}>{request.email}</a></td>
            <td data-label={t("phone")}>{request.whatsappNumber ? <a href={"https://wa.me/" + request.whatsappNumber.slice(1)} target="_blank" rel="noopener noreferrer">{request.whatsappNumber}</a> : t("unavailable")}</td>
            <td data-label={t("session")}>{t(request.sessionType)}</td>
            <td data-label={t("location")}>{request.locationName || t("unavailable")}</td>
            <td data-label={t("submitted")}><div>{formatDateTime(request.workflow.submittedAt, locale)}<p className={styles.muted}>{t("waitingMinutes", { minutes: request.workflow.waitingMinutes })}</p></div></td>
            <td data-label={t("statusLabel")}>{t(`statuses.${request.status}`)}</td>
            <td data-label={t("arrivalChoice")}><div>{request.workflow.arrivalStatus ? t(`arrival.${request.workflow.arrivalStatus}`) : t("unavailable")} {request.workflow.arrivalUpdatedAt && <p className={styles.muted}>{formatDateTime(request.workflow.arrivalUpdatedAt, locale)}</p>}</div></td>
            <td data-label={t("openDetails")}><Link className="button-quiet" href={"/admin/urgent-requests/" + request.bookingCode}>{t("openDetails")}</Link></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className={styles.actions}>
        <button className="button-quiet" disabled={!data?.offset} onClick={() => {
          const params = new URLSearchParams(lookup || "");
          params.set("offset", String(Math.max(0, (data?.offset || 0) - 200)));
          setLookup("?" + params.toString());
        }}>{t("previousPage")}</button>
        <button className="button-quiet" disabled={!data?.hasMore} onClick={() => {
          const params = new URLSearchParams(lookup || "");
          params.set("offset", String((data?.offset || 0) + 200));
          setLookup("?" + params.toString());
        }}>{t("nextPage")}</button>
      </div>
    </div>
  );
}
