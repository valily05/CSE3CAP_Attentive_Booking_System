"use client";
import {ForwardArrow} from "@/components/ui/ForwardArrow";
import Link from "next/link";
import { type CSSProperties, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {Clock3, HeartHandshake, CalendarCheck, ScanLine, Mail, MapPin, MessageCircle, QrCode, ClipboardList, DoorOpen, TextCursorInput, Video} from "lucide-react";
import styles from "./UrgentHow.module.css";
import { WhatsAppIcon } from "@/components/ui/WhatsAppIcon";
import { PreviewName } from "./PreviewName";
import { MeetingPreview, PassPreview, ScanPreview, WhatsAppPreview, OnlineMeetingPreview } from "./UrgentPreviewEffects";
const inPersonIcons=[ClipboardList,MapPin,QrCode,ScanLine];
const onlineIcons=[ClipboardList,Video,WhatsAppIcon,CalendarCheck];
export function UrgentHow(){
 const t=useTranslations("urgentHow");const [active,setActive]=useState(0);const tabs=useRef<(HTMLButtonElement|null)[]>([]);const [mode,setMode]=useState<"online"|"inPerson">("online");const icons=mode==="online"?onlineIcons:inPersonIcons;const Icon=icons[active];
 const chooseStep=(next:number)=>setActive(next);
 const step=(i:number)=>`${mode==="online"&&i>=2?"onlineSteps":"steps"}.${i}`;
 return <section className={styles.section} aria-labelledby="urgent-how-title">
  <header className={styles.heading}><p className={styles.eyebrow}><span className={styles.liveDot} aria-hidden="true"/>{t("eyebrow")}</p><h2 id="urgent-how-title">{t("title")}</h2><p>{t("intro")}</p></header>
  <div className={styles.pathToggle} role="group" aria-label={t("pathLabel")}>{(["online","inPerson"] as const).map(path=><button key={path} type="button" aria-pressed={mode===path} onClick={()=>{setMode(path);chooseStep(0);}}>{path==="online"?<Video size={17}/>:<MapPin size={17}/ >}{t(path)}</button>)}</div>
  <div className={styles.stepper} data-start={active===0} style={{"--filled":`${active*25}%`} as CSSProperties} role="tablist" aria-label={t("stepperLabel")}>
   <span className={styles.walkingCat} style={{left:`${12.5+active*25}%`}} aria-hidden="true"><picture><source media="(prefers-reduced-motion: reduce)" srcSet="/brand/urgent-fluffy-cat-slow-still.png"/><img src="/brand/urgent-fluffy-cat-slow-walk.gif" alt="" width="112" height="84"/></picture></span>
   {[0,1,2,3].map(i=><button key={i} ref={el=>{tabs.current[i]=el;}} id={`urgent-how-tab-${i}`} role="tab" type="button" aria-selected={active===i} aria-controls="urgent-how-panel" tabIndex={active===i?0:-1} data-state={active===i?"active":active>i?"complete":"upcoming"} onClick={()=>chooseStep(i)} onKeyDown={e=>{let next=active;if(e.key==="ArrowRight")next=(active+1)%4;else if(e.key==="ArrowLeft")next=(active+3)%4;else if(e.key==="Home")next=0;else if(e.key==="End")next=3;else return;e.preventDefault();chooseStep(next);tabs.current[next]?.focus();}}><span className={styles.stepTrack}><span className={styles.stepDot}>{i+1}</span></span><span className={styles.stepLabel}>{t(`${step(i)}.label`)}</span></button>)}
  </div>
  <div id="urgent-how-panel" className={styles.panel} role="tabpanel" aria-labelledby={`urgent-how-tab-${active}`}>
   <div className={styles.illustration} aria-hidden="true"><div className={styles.previewCard}>
    <div className={styles.previewTitle}><span className={styles.previewIcon}><Icon size={30} strokeWidth={1.6}/></span><div className={styles.previewTitleCopy}><strong>{t(`${step(active)}.label`)}</strong><p>{t(`${step(active)}.hint`)}</p></div><span className={styles.requestStatus}><span/>{t("urgentLabel")}</span></div>
    {active===0?<div className={styles.previewFields}><span><TextCursorInput size={18}/><span className={styles.previewFieldText}><small>{t("name")}</small><b><PreviewName value={t("sampleName")}/></b></span></span><span><Mail size={18}/><span className={styles.previewFieldText}><small>{t("email")}</small><b><PreviewName value={t("sampleEmail")}/></b></span></span></div>:active===1?<MeetingPreview mode={mode}/>:mode==="inPerson"&&active===2?<PassPreview/>:mode==="inPerson"&&active===3?<ScanPreview/>:active===2?<WhatsAppPreview/>:<OnlineMeetingPreview/>}
    {active!==0&&<div className={styles.previewFooter}><Icon size={13}/>{t(`${step(active)}.visualNote`)}</div>}
   </div></div>
   <div className={styles.detail}><p className={styles.stepKicker}>{t("stepNumber",{number:active+1})}</p><h3>{t(`${step(active)}.title`)}</h3><p className={styles.body}>{t(`${step(active)}.body`)}</p><ul>{[0,1,2].map(i=><li key={i}><span>{active===0?(i===0?<DoorOpen size={15}/>:i===1?<Mail size={15}/>:<MessageCircle size={15}/>):i===0?<Icon size={13}/>:i===1?<CalendarCheck size={15}/>:<MessageCircle size={13}/>}</span>{t(`${step(active)}.points.${i}`)}</li>)}</ul><button type="button" className={styles.next} onClick={()=>chooseStep((active+1)%4)}>{t(active===3?"first":"next")}<ForwardArrow/></button></div>
  </div>
  <footer className={styles.footer}>
   <div className={styles.readyCopy}><span className={styles.readyIcon} aria-hidden="true"><HeartHandshake size={27} strokeWidth={1.5}/></span><div><p className={styles.readyKicker}>{t("readyKicker")}</p><h3>{t("footer")}</h3><p className={styles.readyBody}>{t("footerBody")}</p></div></div>
   <div className={styles.readyAction}><Link href="/urgent-scheduling" className={styles.startButton}>{t("start")}<ForwardArrow/></Link></div>
  </footer>
  <p className={styles.availability}><Clock3 size={13} aria-hidden="true"/>{t("availability")}</p>
 </section>;
}
