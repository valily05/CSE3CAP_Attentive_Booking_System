"use client";
import {useEffect,useState} from "react";
import {useTranslations} from "next-intl";
import {Sun,Moon} from "lucide-react";
import styles from "./SignInLayout.module.css";
export function SignInThemeToggle(){const t=useTranslations();const[dark,setDark]=useState(false);useEffect(()=>{const root=document.documentElement;const media=matchMedia('(prefers-color-scheme: dark)');const sync=()=>setDark(root.dataset.theme?root.dataset.theme==='dark':media.matches);const observer=new MutationObserver(sync);observer.observe(root,{attributes:true,attributeFilter:['data-theme']});media.addEventListener('change',sync);sync();return()=>{observer.disconnect();media.removeEventListener('change',sync);};},[]);return <button type="button" className={styles.themeToggle} aria-label={t('theme.toggle')} title={t('theme.toggle')} aria-pressed={dark} onClick={()=>{const next=dark?'light':'dark';document.cookie='theme='+next+'; path=/; max-age=31536000; samesite=lax';document.documentElement.dataset.theme=next;setDark(!dark);}}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button>;}
