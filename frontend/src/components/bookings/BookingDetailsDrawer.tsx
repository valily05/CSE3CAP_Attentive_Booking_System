"use client";
import Link from "next/link";
import Image from "next/image";
import {createPortal} from "react-dom";
import {useEffect,useId,useRef,useState,useSyncExternalStore} from "react";
import {X,CalendarDays,Clock3,UserRound,MapPin,ArrowUpRight} from "lucide-react";
import {useTranslations} from "next-intl";
import {api,errorCode} from "@/lib/api";
import {dateKey,formatDate,formatDateTime,formatFullDateTime,formatTime} from "@/lib/time";
import {useAppLocale} from "@/lib/i18n";
import type {Booking,Slot} from "@/lib/types";
import {Reschedule,CancelDialog} from "./BookingActions";
import styles from "./MyBookings.module.css";
const query='(max-width:59.999rem)';
const subscribe=(fn:()=>void)=>{const m=matchMedia(query);m.addEventListener('change',fn);return()=>m.removeEventListener('change',fn)};
export function BookingDetailsDrawer({booking:b,onClose,onDone,onError,now}:{booking:Booking;onClose:()=>void;onDone:(message:string)=>Promise<void>;onError:(code:string)=>void;now:Date}){
 const t=useTranslations('bookingDetails'),all=useTranslations(),locale=useAppLocale();const title=useId(),panel=useRef<HTMLDivElement>(null),close=useRef<HTMLButtonElement>(null);const[mode,setMode]=useState<'idle'|'move'|'cancel'>('idle'),[busy,setBusy]=useState(false);const mobile=useSyncExternalStore(subscribe,()=>matchMedia(query).matches,()=>false);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;close.current?.focus();const keys=(e:KeyboardEvent)=>{if(document.querySelector("dialog[open]"))return;if(e.key==='Escape'){onClose();return}if(e.key!=='Tab'||!mobile)return;const controls=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')||[]);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&(document.activeElement===first||!panel.current?.contains(document.activeElement))){e.preventDefault();last?.focus()}else if(!e.shiftKey&&(document.activeElement===last||!panel.current?.contains(document.activeElement))){e.preventDefault();first?.focus()}};document.addEventListener('keydown',keys);return()=>{document.removeEventListener('keydown',keys);if(previous?.isConnected)previous.focus()}},[mobile,onClose]);
 useEffect(()=>{if(!mobile)return;const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old}},[mobile]);
 const changeable=b.status==='confirmed'&&b.canChange;
 const duration=Math.max(0,Math.round((Date.parse(b.end)-Date.parse(b.start))/60000));
 async function move(slot:Slot){if(busy)return;setBusy(true);try{await api.post(`/api/bookings/${b.id}/reschedule`,{start:slot.Start});setMode('idle');await onDone(all('bookings.moved',{date:formatDate(slot.Start,locale),time:formatTime(slot.Start,locale)}))}catch(e){onError(errorCode(e))}finally{setBusy(false)}}
 return createPortal(<><button type="button" className={styles.drawerShade} aria-label={t('close')} tabIndex={-1} onClick={onClose}/><div ref={panel} role="dialog" aria-modal={mobile||undefined} aria-labelledby={title} className={styles.drawer}>
 <header className={styles.drawerHeader}><div><p className={styles.drawerEyebrow}>{t('session')}</p><h2 id={title}>{t('title')}</h2></div><span className={styles.status} data-status={b.status}>{all(`bookings.status.${b.status}`)}</span><button ref={close} className={styles.drawerClose} type="button" aria-label={t('close')} onClick={onClose}><X size={20}/></button></header>
 <div className={styles.drawerBody}><section className={styles.reference}><span>{t('reference')}</span><strong>{b.code}</strong><span className={styles.priority} data-urgent={b.isUrgent||undefined}>{t(b.isUrgent?'urgent':'normal')}</span></section>
 <section><h3>{t('sessionInfo')}</h3><dl className={styles.detailGrid}><dt><CalendarDays size={16}/>{t('date')}</dt><dd>{formatDate(b.start,locale)}</dd><dt><Clock3 size={16}/>{t('time')}</dt><dd>{t("timeRange",{start:formatTime(b.start,locale),end:formatTime(b.end,locale)})}</dd><dt>{t('duration')}</dt><dd>{t('minutes',{minutes:duration})}</dd><dt>{t('type')}</dt><dd>{all(`sessionType.${b.mode==='online'?b.onlineChannel||'video':'in_person'}`)}</dd><dt>{t('service')}</dt><dd>{b.serviceName}</dd>{b.mode==='in_person'&&<><dt><MapPin size={16}/>{t('location')}</dt><dd>{b.locationName}</dd></>}</dl></section>
 <section><h3>{t('psychologist')}</h3><div className={styles.psychologist}>{b.psychologistPhoto?<Image src={b.psychologistPhoto} alt="" width={54} height={54} unoptimized/>:<span className={styles.photoFallback}><UserRound size={28}/></span>}<div><strong>{b.psychologistName}</strong>{b.psychologistSpecialty&&<p>{b.psychologistSpecialty}</p>}<Link href={`/psychologists/${b.psychologistId}`}>{t('viewProfile')}<ArrowUpRight size={15}/></Link></div></div></section>
 {b.lastRescheduled&&<section><h3>{t('lastRescheduled')}</h3><dl className={styles.detailGrid}><dt>{t('previousTime')}</dt><dd>{formatFullDateTime(b.lastRescheduled.from,locale)}</dd><dt>{t('newTime')}</dt><dd>{formatFullDateTime(b.lastRescheduled.to,locale)}</dd><dt>{t('changedAt')}</dt><dd>{formatFullDateTime(b.lastRescheduled.at,locale)}</dd></dl></section>}
 <section><h3>{t('bookingInfo')}</h3><dl className={styles.detailGrid}><dt>{t('method')}</dt><dd>{b.bookingMethod?t(b.bookingMethod):t('unavailable')}</dd><dt>{t('bookedBy')}</dt><dd>{b.bookedByName||(b.bookingMethod==='admin_assisted'?t('administrator'):t('unavailable'))}</dd><dt>{t('created')}</dt><dd>{b.createdAt?formatFullDateTime(b.createdAt,locale):t('unavailable')}</dd><dt>{t('updated')}</dt><dd>{b.updatedAt?formatFullDateTime(b.updatedAt,locale):t('unavailable')}</dd></dl></section>
 {changeable&&b.changeDeadline&&<p className={styles.drawerNote}>{all('bookings.changeUntil',{deadline:formatDateTime(b.changeDeadline,locale)})}</p>}
 {mode==='move'&&changeable&&<section className={styles.drawerMove}><div className={styles.moveHeading}><h3>{all("bookings.pickNewTime")}</h3><button type="button" aria-label={t("closeChange")} onClick={()=>setMode("idle")}><X size={18}/></button></div><fieldset disabled={busy}><Reschedule booking={b} today={dateKey(now)} onPick={move}/></fieldset></section>}
 </div><footer className={styles.drawerFooter}>{changeable?<><button type="button" className="button" disabled={busy} onClick={()=>setMode('move')}>{t('change')}</button><button type="button" className={`button-quiet ${styles.cancelAction}`} disabled={busy} onClick={()=>setMode('cancel')}>{all('bookings.cancel')}</button></>:b.status==='confirmed'?<p>{all('bookings.contactAdmin')}</p>:<p>{t('noActions')}</p>}</footer>
 {mode==='cancel'&&changeable&&<CancelDialog onClose={()=>setMode('idle')} onConfirm={async reason=>{await api.post(`/api/bookings/${b.id}/cancel`,{reason});setMode('idle');await onDone(all('bookings.cancelled'))}}/>}
 </div></>,document.body)
}
