"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { dismissUrgentNotification, markUrgentNotificationSeen, readUrgentNotifications, saveUrgentNotification, URGENT_NOTIFICATIONS_CHANGED, type UrgentNotification } from "@/lib/urgentNotifications";
import type { UrgentReceipt } from "@/components/urgent/types";
import { useSession } from "./Session";
import styles from "./Header.module.css";

export function UrgentNotifications() {
 const t = useTranslations("urgent");
 const a=useTranslations("accountNotifications");
 const {me}=useSession();
 const owner=me?.role==="client"?me.email:"";
 type Notice={id:string;kind:string;read:boolean};
 const [account,setAccount]=useState<{email:string;items:Notice[]}>({email:"",items:[]});
 const notices=account.email===owner?account.items:[];
 useEffect(()=>{if(!owner)return;let live=true;const refresh=()=>{if(!document.hidden)void api.get<{items:Notice[]}>("/api/me/notifications").then(data=>{if(live)setAccount({email:owner,items:data.items})}).catch(()=>{})};refresh();window.addEventListener("focus",refresh);return()=>{live=false;window.removeEventListener("focus",refresh)}},[owner]);
 const updateNotice=async(id:string,dismiss=false)=>{try{await api.post("/api/me/notifications/"+id+(dismiss?"/dismiss":"/read"));setAccount(current=>current.email===owner?{...current,items:dismiss?current.items.filter(x=>x.id!==id):current.items.map(x=>x.id===id?{...x,read:true}:x)}:current)}catch{}};
 const [items, setItems] = useState<UrgentNotification[]>([]);
 const [open, setOpen] = useState(false);
 const panel = useRef<HTMLDivElement>(null);
 useEffect(() => {
  const sync = () => setItems(readUrgentNotifications());
  const refresh = async () => {
   if (document.hidden) return;
   for (const item of readUrgentNotifications()) {
    try {
     const receipt = await api.post<UrgentReceipt>("/api/urgent-requests/receipt", { token: item.token });
     const current = readUrgentNotifications().find(entry => entry.code === item.code && entry.token === item.token);
     if (current && receipt.status !== current.status) saveUrgentNotification(receipt, item.token);
    } catch { /* An expired notice remains available as a booking reference. */ }
   }
  };
  sync(); void refresh();
  window.addEventListener("storage", sync);
  window.addEventListener(URGENT_NOTIFICATIONS_CHANGED, sync);
  const timer = window.setInterval(refresh, 30000);
  return () => { window.removeEventListener("storage", sync); window.removeEventListener(URGENT_NOTIFICATIONS_CHANGED, sync); window.clearInterval(timer); };
 }, []);
 useEffect(() => {
  if (!open) return;
  const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node)) setOpen(false); };
  const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); panel.current?.querySelector("button")?.focus(); } };
  document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
  return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
 }, [open]);
 const unread = items.filter(item => !item.seen).length + notices.filter(item=>!item.read).length;
 return <div className={styles.notifications} ref={panel}>
  <button type="button" className={styles.theme} aria-label={t("notifications")} aria-expanded={open} aria-controls="urgent-notifications" onClick={() => setOpen(!open)}>
   <Bell size={19} aria-hidden="true" />{unread > 0 && <span className={styles.notificationCount}>{unread}</span>}
  </button>
  {open && <section id="urgent-notifications" className={styles.notificationPanel} aria-label={t("notifications")}>
   <h2>{t("notifications")}</h2><p>{owner?a("intro"):t("notificationsBrowser")}</p>
   {items.length || notices.length ? <ul>{notices.map(item=><li key={item.id}><Link href="/#find-support" onClick={()=>{void updateNotice(item.id);setOpen(false)}}><strong>{a("welcome")}</strong><span>{a("body")}</span></Link><button type="button" className="button-quiet" aria-label={a("dismiss")} onClick={()=>void updateNotice(item.id,true)}><X size={16} aria-hidden="true"/></button></li>)}{items.map(item => <li key={item.code}>
    <Link href={`/urgent-confirmation/${item.code}#${item.token}`} onClick={() => { markUrgentNotificationSeen(item.code); setOpen(false); }}>
     <strong>{item.code}</strong><span>{t(`statuses.${item.status}`)}</span><span>{t("viewConfirmation")}</span>
    </Link>
    <button type="button" className="button-quiet" aria-label={`${t("dismissNotification")} ${item.code}`} onClick={() => dismissUrgentNotification(item.code)}><X size={16} aria-hidden="true" /></button>
   </li>)}</ul> : <p>{owner?a("empty"):t("notificationsEmpty")}</p>}
  </section>}
 </div>;
}
