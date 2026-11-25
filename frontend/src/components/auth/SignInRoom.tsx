"use client";
import {useState} from "react";
import {useTranslations} from "next-intl";
import {PawPrint,ChevronDown,ChevronUp} from "lucide-react";
import {AttentiveHouse} from "./AttentiveHouse";
import styles from "./SignInLayout.module.css";
export function SignInRoom(){const t=useTranslations('auth');const[open,setOpen]=useState(false);return <aside className={styles.visual} aria-label={t('houseCanvasLabel')}><button type="button" className={styles.mobileRoomButton} aria-expanded={open} aria-controls="signin-room-content" onClick={()=>setOpen(value=>!value)}><PawPrint size={18} aria-hidden="true"/><span>{t(open?'mobileHideRoom':'mobileExploreRoom')}</span>{open?<ChevronUp size={16} aria-hidden="true"/>:<ChevronDown size={16} aria-hidden="true"/>}</button><div id="signin-room-content" className={styles.roomContent} data-expanded={open}><AttentiveHouse/></div></aside>;}
