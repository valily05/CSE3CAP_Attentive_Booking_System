"use client";

import { useState } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import { useTranslations } from "next-intl";
import { useApi } from "@/lib/useApi";
import { useAppLocale } from "@/lib/i18n";
import { formatFullDateTime } from "@/lib/time";
import type { Booking } from "@/lib/types";
import { useSession } from "@/components/shell/Session";
import { UrgentBadge } from "@/components/urgent/UrgentBadge";
import styles from "./MyHistory.module.css";

const CLOSED = new Set(["attended","no_show","cancelled","expired","paid_late"]);
const STATUSES = ["attended","no_show","cancelled","confirmed","expired","paid_late","waiting_payment"];
export function MyHistory() {
 const t=useTranslations();const locale=useAppLocale();const {me,ready}=useSession();
 const url=me?.role==="admin"?"/api/admin/bookings":me?.role==="psychologist"?"/api/psy/schedule":me?.role==="client"?"/api/me/bookings":null;
 const {data,error}=useApi<{bookings:Booking[]}>(url);
 const [query,setQuery]=useState("");const [status,setStatus]=useState("");const [limit,setLimit]=useState(20);
 const [now]=useState(()=>Date.now());
 if(!ready)return <p>{t("common.loading")}</p>;
 if(!me)return <section className={styles.guest} aria-labelledby="guest-history-title"><span className={styles.guestIcon}><History size={28} aria-hidden="true"/></span><h2 id="guest-history-title">{t("history.guestTitle")}</h2><p>{t("history.guestBody")}</p><Link className="button" href="/signin?next=/history">{t("nav.signIn")}</Link></section>;
 if(error)return <p role="alert">{t(`errors.${error}`)}</p>;
 if(!data)return <p role="status">{t("common.loading")}</p>;
 const history=data.bookings.filter(b=>CLOSED.has(b.status)||Date.parse(b.end)<=now).sort((a,b)=>b.start.localeCompare(a.start));
 const search=query.trim().toLocaleLowerCase();
 const filtered=history.filter(b=>(!status||b.status===status)&&(!search||[b.code,b.psychologistName,b.serviceName,b.clientName,b.locationName].some(value=>value?.toLocaleLowerCase().includes(search))));
 const showClient=me.role!=="client";
 const statusText=(value:string)=>value==="confirmed"?t("history.awaitingAttendance"):t(`bookings.status.${value}`);
 return <div className={styles.page}>
  <div className={styles.intro}><p>{t(`history.${me.role}Body`)}</p><Link className="button-quiet" href={me.role==="admin"?"/admin":me.role==="psychologist"?"/schedule":"/bookings"}>{t(me.role==="admin"?"nav.calendar":me.role==="psychologist"?"nav.mySchedule":"nav.myBookings")}</Link></div>
  <dl className={styles.summary}>
   {[{label:"total",count:history.length},{label:"attended",count:history.filter(b=>b.status==="attended").length},{label:"missed",count:history.filter(b=>b.status==="no_show").length},{label:"cancelled",count:history.filter(b=>b.status==="cancelled").length}].map(item=><div key={item.label}><dt>{t(`history.${item.label}`)}</dt><dd>{item.count}</dd></div>)}
  </dl>
  <div className={styles.filters}>
   <label className="field"><span>{t("history.search")}</span><input type="search" value={query} onChange={e=>{setQuery(e.target.value);setLimit(20);}} /></label>
   <label className="field"><span>{t("bookings.colStatus")}</span><select value={status} onChange={e=>{setStatus(e.target.value);setLimit(20);}}><option value="">{t("history.allStatuses")}</option>{STATUSES.map(value=><option key={value} value={value}>{statusText(value)}</option>)}</select></label>
  </div>
  <p className={styles.result} role="status">{t("history.results",{count:filtered.length})}</p>
  {filtered.length===0?<p className={styles.empty}>{t(history.length?"history.noMatches":"history.empty")}</p>:<div className={styles.tableWrap}><table className={styles.table} aria-label={t("nav.myHistory")}>
   <thead><tr><th scope="col">{t("bookings.colDate")}</th><th scope="col">{t("urgent.reference")}</th>{showClient&&<th scope="col">{t("history.client")}</th>}<th scope="col">{t("bookings.colWith")}</th><th scope="col">{t("bookings.colSession")}</th><th scope="col">{t("history.place")}</th><th scope="col">{t("bookings.colStatus")}</th></tr></thead>
   <tbody>{filtered.slice(0,limit).map(b=><tr key={b.id}>
    <td data-label={t("bookings.colDate")}>{formatFullDateTime(b.start,locale)}</td>
    <td data-label={t("urgent.reference")}><div><strong>{b.code}</strong><UrgentBadge urgent={b.isUrgent}/></div></td>
    {showClient&&<td data-label={t("history.client")}>{b.clientName}</td>}
    <td data-label={t("bookings.colWith")}>{b.psychologistName}</td><td data-label={t("bookings.colSession")}>{b.serviceName}</td>
    <td data-label={t("history.place")}>{b.mode==="online"?t(`sessionType.${b.onlineChannel||"video"}`):b.locationName}</td>
    <td data-label={t("bookings.colStatus")}><span className={styles.status} data-status={b.status}>{statusText(b.status)}</span></td>
   </tr>)}</tbody>
  </table></div>}
  {filtered.length>limit&&<button type="button" className="button-quiet" onClick={()=>setLimit(limit+20)}>{t("history.loadMore")}</button>}
 </div>;
}
