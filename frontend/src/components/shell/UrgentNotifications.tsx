"use client";

import { useEffect,useLayoutEffect, useRef, useState } from "react";
import {createPortal} from "react-dom";
import {Bell,BellRing,HandHeart,PhoneCall,CalendarCheck,CheckCircle2,CircleX} from "lucide-react";
import Link from "next/link";
import {useAppLocale} from "@/lib/i18n";
import {formatFullDateTime} from "@/lib/time";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { markUrgentNotificationSeen, readUrgentNotifications, saveUrgentNotification, URGENT_NOTIFICATIONS_CHANGED, type UrgentNotification } from "@/lib/urgentNotifications";
import type { UrgentReceipt } from "@/components/urgent/types";
import { useSession } from "./Session";
import styles from "./Header.module.css";

export function UrgentNotifications() {
 const t = useTranslations("urgent");
 const locale=useAppLocale();
 const timestamp=(value:string)=>{const date=new Date(value);return Number.isNaN(date.valueOf())?null:<time dateTime={value}>{formatFullDateTime(date,locale)}</time>};
 const a=useTranslations("accountNotifications");
 const w=useTranslations("waiting");
 const all=useTranslations();
 const ui=useTranslations("notificationsUi");
 const {me}=useSession();
 const owner=me?.role==="client"?me.email:"";
 type Notice={id:string;kind:string;read:boolean;createdAt:string;details?:{link:string;psychologistName:string;start:string;sessionType:string;locationName:string}};
 const [account,setAccount]=useState<{email:string;items:Notice[]}>({email:"",items:[]});
 const notices=account.email===owner?account.items:[];
 useEffect(()=>{if(!owner)return;let live=true;const refresh=()=>{if(!document.hidden)void api.get<{items:Notice[]}>("/api/me/notifications").then(data=>{if(live)setAccount({email:owner,items:data.items})}).catch(()=>{})};refresh();const timer=setInterval(refresh,30000);window.addEventListener("focus",refresh);return()=>{live=false;clearInterval(timer);window.removeEventListener("focus",refresh)}},[owner]);
 const updateNotice=async(id:string,dismiss=false)=>{try{await api.post("/api/me/notifications/"+id+(dismiss?"/dismiss":"/read"));setAccount(current=>current.email===owner?{...current,items:dismiss?current.items.filter(x=>x.id!==id):current.items.map(x=>x.id===id?{...x,read:true}:x)}:current)}catch{}};
 const [items, setItems] = useState<UrgentNotification[]>([]);
 const [open, setOpen] = useState(false);
 const panel = useRef<HTMLDivElement>(null);
 const menu=useRef<HTMLElement>(null);
 useLayoutEffect(()=>{if(!open)return;const position=()=>{const trigger=panel.current?.querySelector("button"),el=menu.current;if(!trigger||!el)return;const box=trigger.getBoundingClientRect(),width=el.getBoundingClientRect().width,left=Math.max(12,Math.min(box.right-width,window.innerWidth-width-12)),top=box.bottom+12;el.style.left=left+"px";el.style.top=top+"px";el.style.setProperty("--notification-tail-left",Math.max(18,Math.min(width-18,box.left+box.width/2-left))+"px");el.style.setProperty("--notification-top",top+"px")};position();window.addEventListener("resize",position);window.addEventListener("scroll",position,true);return()=>{window.removeEventListener("resize",position);window.removeEventListener("scroll",position,true)}},[open]);
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
  const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node)&&!menu.current?.contains(event.target as Node)) setOpen(false); };
  const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); panel.current?.querySelector("button")?.focus(); } };
  document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
  return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
 }, [open]);
 const unread = items.filter(item => !item.seen).length + notices.filter(item=>!item.read).length;
 return <div className={styles.notifications} ref={panel}>
  <button type="button" className={styles.theme} aria-label={t("notifications")} aria-expanded={open} aria-controls="urgent-notifications" onClick={() => setOpen(!open)}>
   <Bell size={19} aria-hidden="true" />{unread > 0 && <span className={styles.notificationCount}>{unread}</span>}
  </button>
  {open && createPortal(<section ref={menu} id="urgent-notifications" className={styles.notificationPanel} aria-label={t("notifications")}>
   <h2>{t("notifications")}</h2>
   {items.length||notices.length?<ul>{notices.map(item=><li key={item.id} data-unread={!item.read||undefined}><Link href={item.kind==="waiting_slot"?item.details?.link||"/bookings#waiting-list":"/#find-support"} onClick={()=>{void updateNotice(item.id);setOpen(false)}}><span className={styles.notificationIcon}>{item.kind==="waiting_slot"?<BellRing size={21}/>:<HandHeart size={21}/>}</span><div className={styles.notificationCopy}><strong>{item.kind==="waiting_slot"?w("available"):a("welcome")}</strong><span>{item.kind==="waiting_slot"?<>{item.details?.psychologistName}<br/>{item.details?.start&&formatFullDateTime(item.details.start,locale)} · {all(`sessionType.${item.details?.sessionType||"video"}`)} {item.details?.locationName}<br/>{w("viewSlot")}</>:a("body")}</span>{timestamp(item.createdAt)}</div><span className={styles.unreadDot} data-read={item.read||undefined} aria-hidden="true"/>{!item.read&&<span className="visually-hidden">{ui("unread")}</span>}</Link></li>)}{items.map(item=>{const Icon=item.status==="CANCELLED"?CircleX:item.status==="COMPLETED"?CheckCircle2:["CONFIRMED","ASSIGNED"].includes(item.status)?CalendarCheck:PhoneCall;return <li key={item.code} data-unread={!item.seen||undefined}><Link href={`/urgent-confirmation/${item.code}#${item.token}`} onClick={()=>{markUrgentNotificationSeen(item.code);setOpen(false)}}><span className={styles.notificationIcon} data-urgent><Icon size={21}/></span><div className={styles.notificationCopy}><strong>{item.code}</strong><span>{t(`statuses.${item.status}`)}</span><span>{t("viewConfirmation")}</span>{timestamp(item.submittedAt)}</div><span className={styles.unreadDot} data-read={item.seen||undefined} aria-hidden="true"/>{!item.seen&&<span className="visually-hidden">{ui("unread")}</span>}</Link></li>})}</ul>:<div className={styles.notificationEmpty}><span><Bell size={27} strokeWidth={1.5}/></span><strong>{ui("emptyTitle")}</strong><p>{ui("emptyBody")}</p></div>}
  </section>,document.body)}
 </div>;
}
