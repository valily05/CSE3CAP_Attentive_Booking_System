"use client";
import {ForwardArrow} from "@/components/ui/ForwardArrow";
import {useEffect,useState} from "react";
import Link from "next/link";
import {CheckCircle2, TriangleAlert, X} from "lucide-react";
import {useTranslations} from "next-intl";
import {emailVerificationEvent,emailVerificationStorageKey,type EmailVerificationNotice} from "@/lib/email-verification";
import {readRegistrationRecovery} from "@/lib/registration-recovery";
import styles from "./EmailVerificationToast.module.css";
export function EmailVerificationToast(){
 const t=useTranslations('auth'),errors=useTranslations('errors');const[notice,setNotice]=useState<EmailVerificationNotice|null>(null);
 useEffect(()=>{const onNotice=(e:Event)=>setNotice((e as CustomEvent<EmailVerificationNotice>).detail);const onStorage=(e:StorageEvent)=>{if(e.key!==emailVerificationStorageKey||!e.newValue)return;try{const item=JSON.parse(e.newValue);if(item.type==='verified'&&typeof item.email==='string'&&typeof item.at==='number'&&Math.abs(Date.now()-item.at)<60000){setNotice(item)}}catch{}};window.addEventListener(emailVerificationEvent,onNotice);window.addEventListener('storage',onStorage);return()=>{window.removeEventListener(emailVerificationEvent,onNotice);window.removeEventListener('storage',onStorage)}},[]);
 useEffect(()=>{if(!notice)return;let timer:ReturnType<typeof setTimeout>|undefined;const schedule=()=>{if(timer)clearTimeout(timer);if(document.visibilityState==='visible')timer=setTimeout(()=>setNotice(null),20000)};schedule();document.addEventListener('visibilitychange',schedule);return()=>{if(timer)clearTimeout(timer);document.removeEventListener('visibilitychange',schedule)}},[notice]);
 if(!notice)return null;const success=notice.type==='verified';const recovery=readRegistrationRecovery();const href=success?(recovery?.residence&&recovery.email===notice.email.trim().toLowerCase()?'/signin?next=/account/residence':'/signin'):'/resend-verification';
 return <aside data-site-toast className={styles.toast} role={success?'status':'alert'} aria-live={success?'polite':'assertive'} data-email-verification-toast={notice.type}>
 {success?<CheckCircle2 size={23} aria-hidden="true"/>:<TriangleAlert size={23} aria-hidden="true"/>}<div><p className={styles.title}>{t(success?'verificationToastTitle':'verificationToastErrorTitle')}</p><p className={styles.body}>{success?t('verificationToastBody'):['not_found','bad_request'].includes(notice.code)?t('verificationLinkInvalid'):errors.has(notice.code)?errors(notice.code):errors('internal')}</p><Link href={href}>{t(success?'continueToLogin':'resendVerification')}<ForwardArrow/></Link></div><button type="button" aria-label={t('dismissVerificationNotice')} onClick={()=>setNotice(null)}><X size={17} aria-hidden="true"/></button>
 </aside>;
}
