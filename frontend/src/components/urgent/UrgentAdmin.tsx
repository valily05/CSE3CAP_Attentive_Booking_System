"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useApi } from "@/lib/useApi";
import { formatFullDateTime as formatDateTime } from "@/lib/time";
import { useAppLocale } from "@/lib/i18n";
import { urgentStatuses, type UrgentRequest } from "./types";
import {useAdminBranch,adminHref} from "@/components/admin/AdminBranch";
import {Siren,Clock3,UserRound,CalendarCheck,Search,ScanLine,RefreshCw,ArrowUpRight,ChevronDown,Mail,Phone,MapPin,Video,CheckCircle2,X} from "lucide-react";
import styles from "./AdminUrgent.module.css";

type QRDetector = { detect: (video: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorConstructor = new (options: { formats: string[] }) => QRDetector;

export function UrgentAdmin({ verify = false }: { verify?: boolean }) {
  const branch=useAdminBranch();
  const ui=useTranslations("urgentAdminUi");
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
  const { data, error: loadError, reload } = useApi<{ requests: UrgentRequest[]; counts?: Record<string, number>; remainingCodes?: number; offset?: number; hasMore?: boolean }>(lookup === null ? null : "/api/admin/urgent-requests" + (branch==="all"?lookup:"?"+new URLSearchParams({...Object.fromEntries(new URLSearchParams(lookup||"")),location:branch}).toString()));
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

  const cards=[{key:"PENDING",Icon:Siren},{key:"checkedIn",Icon:UserRound},{key:"ASSIGNED",Icon:Clock3},{key:"CONFIRMED",Icon:CalendarCheck}];
  const requests=data?.requests||[];
  return <div className={styles.admin}>
   <header className={styles.heading}><div><h1>{t("adminTitle")}</h1><p>{ui("intro")}</p></div><div className={styles.headingActions}><span className={styles.live}><span/>{ui("live")}</span><button type="button" className={styles.iconButton} aria-label={ui("refresh")} onClick={reload}><RefreshCw size={17}/></button><button type="button" className={styles.scanButton} onClick={()=>setScanning(!scanning)}><ScanLine size={17}/>{t(scanning?"stopScan":"scan")}</button></div></header>
   <section className={styles.summary} aria-label={t("adminTitle")}>{cards.map(({key,Icon})=><article key={key} data-tone={key}><div><span>{t(key==="checkedIn"?"checkedInCount":`summary.${key}`)}</span><span><Icon size={20}/></span></div><strong>{data?.counts?.[key]??0}</strong></article>)}</section>
   {data?.remainingCodes!==undefined&&data.remainingCodes<1000&&<p className={styles.warning}>{t("capacityWarning")}</p>}
   <section className={styles.queuePanel}><header className={styles.queueHeading}><div><h2>{ui("queue")}</h2><p>{ui("queueBody")}</p></div><span className={styles.queueCount}>{requests.length}</span></header>
   <form onSubmit={search} className={styles.filters} aria-label={ui("filters")}>
    <label className={styles.searchField}><span>{t("searchLabel")}</span><span><Search size={17}/><input value={query} placeholder={ui("searchPlaceholder")} onChange={event=>setQuery(event.target.value)} maxLength={254}/></span></label>
    <label className={styles.selectField}><span>{t("statusLabel")}</span><span><select aria-label={t("statusLabel")} value={status} onChange={event=>setStatus(event.target.value)}><option value="">{t("all")}</option>{urgentStatuses.map(value=><option key={value} value={value}>{t(`statuses.${value}`)}</option>)}</select><ChevronDown size={15}/></span></label>
    <label className={styles.selectField}><span>{t("session")}</span><span><select aria-label={t("session")} value={mode} onChange={event=>setMode(event.target.value)}><option value="">{t("all")}</option><option value="online">{t("online")}</option><option value="onsite">{t("onsite")}</option></select><ChevronDown size={15}/></span></label>
    <label className={styles.selectField}><span>{t("location")}</span><span><select aria-label={t("location")} disabled={branch!=="all"} value={branch==="all"?location:branch} onChange={event=>setLocation(event.target.value)}><option value="">{t("all")}</option>{catalog?.locations.map(place=><option key={place.id} value={place.id}>{place.name}</option>)}</select><ChevronDown size={15}/></span></label>
    <div className={styles.filterActions}><button className="button">{ui("apply")}</button><button type="button" className={styles.clearButton} onClick={()=>{setQuery("");setStatus("");setMode("");setLocation("");setLookup("");reload()}}><X size={14}/>{ui("clear")}</button></div>
   </form>
   {scanning&&<div className={styles.scanner}><p><ScanLine size={17}/>{ui("scanHint")}</p><video ref={video} className={styles.video} muted playsInline aria-label={t("scan")}/></div>}
   {notice&&<p role="status" className={styles.notice}>{notice}</p>}{(error||loadError)&&<p role="alert" className={styles.error}>{errors(error||loadError||"internal")}</p>}
   {!data&&!loadError&&<p role="status" className={styles.loading}>{t("loading")}</p>}
   {data&&requests.length===0?<div className={styles.empty}><span><CheckCircle2 size={32}/></span><h3>{ui("emptyTitle")}</h3><p>{ui("emptyBody")}</p></div>:<div className={styles.tableScroll}><table className={styles.queue}><thead><tr><th>{ui("request")}</th><th>{ui("contact")}</th><th>{ui("session")}</th><th>{ui("timing")}</th><th>{t("statusLabel")}</th><th><span className="visually-hidden">{t("openDetails")}</span></th></tr></thead><tbody>{requests.map(request=><tr key={request.id}>
    <td data-label={ui("request")}><Link className={styles.code} href={adminHref("/admin/urgent-requests/"+request.bookingCode,branch)}>{request.bookingCode}</Link><strong className={styles.customer}>{request.customerName}</strong></td>
    <td data-label={ui("contact")}><div className={styles.contact}><a href={"mailto:"+request.email}><Mail size={13}/><span>{request.email}</span></a>{request.whatsappNumber?<a href={"https://wa.me/"+request.whatsappNumber.slice(1)} target="_blank" rel="noopener noreferrer"><Phone size={13}/><span>{request.whatsappNumber}</span></a>:<span className={styles.muted}>{t("unavailable")}</span>}</div></td>
    <td data-label={ui("session")}><div className={styles.session}>{request.sessionType==="online"?<Video size={15}/>:<MapPin size={15}/>}<span>{t(request.sessionType)}</span></div>{request.locationName&&<small className={styles.secondary}>{request.locationName}</small>}</td>
    <td data-label={ui("timing")}><time dateTime={request.workflow.submittedAt}>{formatDateTime(request.workflow.submittedAt,locale)}</time><span className={styles.waiting}><Clock3 size={12}/>{t("waitingMinutes",{minutes:request.workflow.waitingMinutes})}</span>{request.workflow.arrivalStatus&&<small className={styles.secondary}>{t(`arrival.${request.workflow.arrivalStatus}`)}{request.workflow.arrivalUpdatedAt&&" · "+formatDateTime(request.workflow.arrivalUpdatedAt,locale)}</small>}</td>
    <td data-label={t("statusLabel")}><span className={styles.status} data-status={request.status}><span/>{t(`statuses.${request.status}`)}</span></td>
    <td data-label={t("openDetails")}><Link className={styles.viewButton} href={adminHref("/admin/urgent-requests/"+request.bookingCode,branch)}>{t("openDetails")}<ArrowUpRight size={14}/></Link></td>
   </tr>)}</tbody></table></div>}
   <footer className={styles.queueFooter}><span>{ui("records",{from:requests.length?(data?.offset||0)+1:0,to:(data?.offset||0)+requests.length})}</span><div><button className="button-quiet" disabled={!data?.offset} onClick={()=>{const params=new URLSearchParams(lookup||"");params.set("offset",String(Math.max(0,(data?.offset||0)-200)));setLookup("?"+params.toString())}}>{t("previousPage")}</button><button className="button-quiet" disabled={!data?.hasMore} onClick={()=>{const params=new URLSearchParams(lookup||"");params.set("offset",String((data?.offset||0)+200));setLookup("?"+params.toString())}}>{t("nextPage")}</button></div></footer>
   </section>{data?.remainingCodes!==undefined&&<p className={styles.capacity}>{t("capacity",{remaining:data.remainingCodes})}</p>}
  </div>;
}
