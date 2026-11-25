"use client";

import { useEffect, useId, useRef } from "react";
import { BookOpen, Brain, ChevronDown, GraduationCap, Heart, Home, MessageCircle, Palette, Search, Sparkles, Users, UserRound, Check } from "lucide-react";
import styles from "./PsychologistSearch.module.css";

type Option = { value:string; label:string; iconName:string };
type Group = { label:string; options:Option[] };
function serviceIcon(name:string) {
  if (/art/i.test(name)) return Palette;
  if (/brain/i.test(name)) return Brain;
  if (/home|visit/i.test(name)) return Home;
  if (/couple|premarital/i.test(name)) return Heart;
  if (/family/i.test(name)) return Users;
  if (/child/i.test(name)) return Sparkles;
  if (/statistic|research/i.test(name)) return Search;
  if (/expert/i.test(name)) return BookOpen;
  if (/academic|educational/i.test(name)) return GraduationCap;
  if (/adult|individual/i.test(name)) return UserRound;
  return MessageCircle;
}

export function ServiceMenu({ label,allLabel,value,groups,onChange,icons=true }:{label:string;allLabel:string;value:string;groups:Group[];onChange:(value:string)=>void;icons?:boolean}) {
  const ref=useRef<HTMLDetailsElement>(null);
  const uid=useId();
  useEffect(()=>{const close=(e:MouseEvent)=>{if(ref.current?.open&&!ref.current.contains(e.target as Node))ref.current.open=false;};document.addEventListener("click",close);return()=>document.removeEventListener("click",close);},[]);
  const selected=groups.flatMap(g=>g.options).find(o=>o.value===value);
  const choose=(next:string)=>{onChange(next);if(ref.current){ref.current.open=false;ref.current.querySelector("summary")?.focus();}};
  return <div className={`${styles.selectField} ${styles.menuField}`}><span id={`${uid}-label`}>{label}</span>
    <details name="directory-filter-menu" ref={ref} className={styles.serviceMenu} onKeyDown={e=>{if(e.key==="Escape"&&ref.current){ref.current.open=false;ref.current.querySelector("summary")?.focus();}}}>
      <summary aria-labelledby={`${uid}-label ${uid}-value`}><span id={`${uid}-value`}>{selected?.label??allLabel}</span><ChevronDown size={17} aria-hidden="true"/></summary>
      <div className={styles.serviceOptions} role="group" aria-label={label}>
        <button type="button" aria-pressed={!value} onClick={()=>choose("")}>{icons&&<MessageCircle size={19} aria-hidden="true"/>}<span>{allLabel}</span>{!value&&icons&&<Check size={16} aria-hidden="true"/>}</button>
        {groups.map(g=><div key={g.label}><p>{g.label}</p>{g.options.map(o=>{const Icon=serviceIcon(o.iconName);return <button key={o.value} type="button" aria-pressed={value===o.value} onClick={()=>choose(o.value)}>{icons&&<Icon size={19} aria-hidden="true"/>}<span>{o.label}</span>{value===o.value&&icons&&<Check size={16} aria-hidden="true"/>}</button>;})}</div>)}
      </div>
    </details>
  </div>;
}
