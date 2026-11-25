"use client";
import {useEffect,useState} from "react";
import {createPortal} from "react-dom";
import {CheckCircle2,TriangleAlert,X} from "lucide-react";
import {useTranslations} from "next-intl";
import {toastEvent} from "@/lib/toast";
import styles from "../auth/PasswordRecovery.module.css";
export function SiteToast(){const t=useTranslations("auth");const[notice,setNotice]=useState<{message:string;error:boolean}|null>(null);useEffect(()=>{const accept=(e:Event)=>setNotice((e as CustomEvent).detail);window.addEventListener(toastEvent,accept);return()=>window.removeEventListener(toastEvent,accept)},[]);useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(null),20000);return()=>clearTimeout(timer)},[notice]);return notice?createPortal(<aside data-site-toast className={styles.toast} role={notice.error?"alert":"status"}>{notice.error?<TriangleAlert size={24}/>:<CheckCircle2 size={24}/>}<div><strong>{notice.message}</strong></div><button aria-label={t("dismissVerificationNotice")} onClick={()=>setNotice(null)}><X size={17}/></button></aside>,document.body):null}
