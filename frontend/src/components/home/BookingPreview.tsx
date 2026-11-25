"use client";

import {ForwardArrow} from "@/components/ui/ForwardArrow";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {Check, Gift, HeartHandshake, MapPin, Video} from "lucide-react";
import { api } from "@/lib/api";
import type { Psychologist } from "@/lib/types";
import { useAppLocale } from "@/lib/i18n";
import { dateKey, formatDateTime, formatTime, formatShortDay } from "@/lib/time";
import styles from "./Home.module.css";

const TARGETS = ["person", "date", "time", "mode", "book"] as const;
type Target = typeof TARGETS[number];
const LABELS = ["cursorChoose", "cursorDate", "cursorDate", "cursorMode", "cursorBook"] as const;
type Pointer = { x:number; y:number; target:number; reached:number; pressed:boolean; visible:boolean; label:boolean; labelLeft:boolean };

/** Visual walkthrough only: the pointer follows measured elements, never real clicks. */
export function BookingPreview() {
  const t=useTranslations("home"); const all=useTranslations(); const locale=useAppLocale();
  const [person,setPerson]=useState<Psychologist|null>(null);
  const root=useRef<HTMLDivElement>(null);
  const targets=useRef<Partial<Record<Target,HTMLElement|null>>>({});
  const labelRef=useRef<HTMLSpanElement>(null);
  const pointerRef=useRef<HTMLSpanElement>(null);
  const [pointer,setPointer]=useState<Pointer>({x:0,y:0,target:0,reached:-1,pressed:false,visible:false,label:false,labelLeft:false});
  useEffect(()=>{
    let live=true;
    api.get<{psychologists:Psychologist[]}>("/api/psychologists").then(r=>{
      if(live) setPerson([...r.psychologists].sort((a,b)=>(a.nextOpen??"9999").localeCompare(b.nextOpen??"9999"))[0]??null);
    },()=>{});
    return ()=>{live=false;};
  },[]);
  useEffect(()=>{
    const media=matchMedia("(prefers-reduced-motion: reduce)");
    const timers=new Set<ReturnType<typeof setTimeout>>();
    let active=0;
    const later=(fn:()=>void,ms:number)=>{const timer=setTimeout(()=>{timers.delete(timer);fn();},ms);timers.add(timer);};
    const measure=()=>{
      const box=root.current?.getBoundingClientRect(); const target=targets.current[TARGETS[active]]?.getBoundingClientRect();
      if(box&&target){const x=target.left-box.left+target.width/2-3.5;setPointer(p=>({...p,x,y:target.top-box.top+target.height/2-3.5,labelLeft:x+32+(labelRef.current?.offsetWidth??130)>box.width-5}));}
    };
    const move=(index:number)=>{
      if(!targets.current[TARGETS[index]]){if(index<TARGETS.length-1)move(index+1);return;}
      active=index; measure();
      setPointer(p=>({...p,target:index,visible:true,label:false,pressed:false,...(index===0?{reached:-1}:{})}));
      const awaitArrival=()=>{
        const cursor=pointerRef.current?.getBoundingClientRect();
        const target=targets.current[TARGETS[index]]?.getBoundingClientRect();
        if(!cursor||!target)return;
        if(Math.hypot(cursor.left+3.5-target.left-target.width/2,cursor.top+3.5-target.top-target.height/2)>.75){later(awaitArrival,40);return;}
        // Start the click and caption only after the rendered tip has settled.
        later(()=>{
          measure();setPointer(p=>({...p,reached:index,pressed:true}));
          later(()=>setPointer(p=>({...p,label:true})),180);
          later(()=>setPointer(p=>({...p,pressed:false})),320);
          later(()=>{
            if(index<TARGETS.length-1)move(index+1);
            else {setPointer(p=>({...p,visible:false,label:false}));later(()=>move(0),600);}
          },1900);
        },140);
      };
      later(awaitArrival,80);
    };
    const start=()=>{
      timers.forEach(clearTimeout);timers.clear();
      if(media.matches){setPointer(p=>({...p,visible:false,reached:-1,label:false}));return;}
      later(()=>move(0),400);
    };
    const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(measure):null;
    if(root.current)observer?.observe(root.current);
    media.addEventListener("change",start);window.addEventListener("resize",measure);start();
    return ()=>{timers.forEach(clearTimeout);observer?.disconnect();media.removeEventListener("change",start);window.removeEventListener("resize",measure);};
  },[person]);
  const days=person?.week?.slice(0,7)??[];
  const selected=person?.nextOpen?dateKey(person.nextOpen):days.find(day=>day.count>0)?.date;
  const phase=pointer.reached<0?1:pointer.reached<3?2:3;
  return <div className={styles.visual}>
    <div className={styles.seal}><span className={styles.badgeWords}>{t("badgeTop")}<strong><Gift size={17} aria-hidden="true"/>{t("badgeFree")}</strong></span><span className={styles.glare} aria-hidden="true"/></div>
    <section className={styles.preview} role="img" aria-label={t("demoDescription")}>
      <div aria-hidden="true" className={styles.demoContent} ref={root} data-stage={phase}>
        <div className={styles.previewHeader}><div><p className={styles.eyebrow}>{t("demoLabel")}</p><h2>{t("previewTitle")}</h2></div></div>
        <ol className={styles.progress}>{["choose","schedule","confirm"].map((step,i)=>{
          const state=pointer.reached>=4||phase>i+1?"complete":phase===i+1?"active":"upcoming";
          return <li key={step} data-state={state}><span className={styles.stepDot}>{state==="complete"?<Check size={12} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"/>:state==="active"?<i/>:null}</span><div><small>{t("stepLabel",{number:i+1})}</small><strong>{t(step)}</strong></div></li>;
        })}</ol>
        <div className={`${styles.person} ${styles.demoPerson}`} data-selected={pointer.reached>=0}>
          <div className={styles.portrait}>
            {/* eslint-disable-next-line @next/next/no-img-element -- small local illustrative portrait; public directory photo remains unchanged */}
            <img src="/brand/demo-psychologist-portrait.png" alt=""/>
          </div>
          <div className={styles.personInfo}><h3>{t("demoClinicianName")}</h3><p>{t("demoExperience")}</p><span className={styles.specialty}><HeartHandshake size={13}/>{t("demoSpecialty")}</span></div>
          <span className={styles.selectionRadio} ref={e=>{targets.current.person=e;}} data-selected={pointer.reached>=0}/>
        </div>
        <div className={styles.schedulePanel}>
          <div className={styles.scheduleHeading}><strong>{t("cursorDate")}</strong><span>{t("demoTimezone")}</span></div>
          {days.length>0&&<div className={styles.weekPreview}><ul>{days.map(day=><li key={day.date} data-open={day.count>0} data-selected={selected===day.date&&pointer.reached>=1} ref={selected===day.date?e=>{targets.current.date=e;}:undefined}><span>{formatShortDay(`${day.date}T05:00:00Z`,locale).split(" ")[0].replace(",","")}</span><strong>{Number(day.date.slice(-2))}</strong><small className={styles.dayDot} data-open={day.count>0}/></li>)}</ul></div>}
          <div className={styles.demoTimes}><span>{t("demoTimes")}</span><span ref={e=>{targets.current.time=person?.nextOpen?e:null;}} data-selected={pointer.reached>=2}>{person?.nextOpen?t("demoTime",{time:formatTime(person.nextOpen,locale)}):t("mini2")}</span>{person?.nextOpen&&<small className={styles.timeDate} data-visible={pointer.reached>=2}>{formatDateTime(person.nextOpen,locale)}</small>}</div>
        </div>
        <div className={styles.modes}><span className={styles.demoMode} ref={e=>{targets.current.mode=e;}} data-selected={pointer.reached>=3}><Video size={16}/>{all("filter.online")}</span><span><MapPin size={16}/>{all("filter.inPerson")}</span></div>
        <div className={styles.demoConfirm} data-pressed={pointer.target===4&&pointer.pressed} ref={e=>{targets.current.book=e;}} data-selected={pointer.reached>=4} data-enabled={pointer.reached>=3} aria-disabled={pointer.reached<3}><span>{t("cursorBook")}</span><ForwardArrow/></div>
        <span ref={pointerRef} className={styles.demoPointer} data-target={TARGETS[pointer.target]} data-visible={pointer.visible} data-pressed={pointer.pressed} style={{left:pointer.x,top:pointer.y}}>
          <svg width="23" height="25" viewBox="0 0 34 36" fill="none"><path d="M5 10Q2.5 2.5 10 5L29 16Q33 18.5 28 20L20.5 20.8Q18 21 16.8 23.8L12.5 31Q8 36 7 29L5 10Z" fill="#142c52" stroke="white" strokeWidth="2.7" strokeLinejoin="round"/></svg>
          <i className={styles.pointerRipple}/>
          <span ref={labelRef} className={styles.pointerLabel} data-visible={pointer.label} data-side={pointer.labelLeft?"left":"right"}>{t(LABELS[pointer.target])}</span>
        </span>
      </div>
    </section>
  </div>;
}
