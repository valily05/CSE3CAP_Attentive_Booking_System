"use client";

import {ForwardArrow} from "@/components/ui/ForwardArrow";
import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import Image from "next/image";
import {ArrowUpRight, CalendarDays, HeartHandshake, ShieldCheck, UserRound, Video} from "lucide-react";
import { PsychologistSearch } from "@/components/search/PsychologistSearch";
import styles from "./Home.module.css";
import { SignalRings } from "./SignalRings";
import { ConditionDirectory } from "@/components/conditions/ConditionDirectory";
import { BookingPreview } from "./BookingPreview";
import { Affirmation } from "./Affirmation";
import { UrgentHow } from "./UrgentHow";
import { PinkyPromiseIcon } from "@/components/ui/PinkyPromiseIcon";


export function Home() {
  const t = useTranslations("home");
  const [browse, setBrowse] = useState<"psychologists" | "conditions">("psychologists");
  return (
    <div className={styles.home} data-home>
      <div className={styles.heroFrame}>
      <p className={styles.reminderEyebrow}>{t("reminderEyebrow")}</p>
      <section className={styles.hero}>
        <SignalRings />
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span className={styles.dot}/>{t("eyebrow")}</p>
          <h1>{t("headlineStart")} <em>{t("headlineAccent")}</em></h1>
          <p className={styles.lede}><span>{t("introLine1")}</span><span>{t("introLine2")}</span></p>
          <ol className={styles.miniSteps}>{[UserRound,CalendarDays,Video].map((Icon,i)=><li key={i}><span className={styles.stepPill}>{t("stepLabel",{number:i+1})}</span><Icon size={25} strokeWidth={1.5} aria-hidden="true"/><strong>{t(`mini${i+1}`)}</strong></li>)}</ol>
          <div className={styles.actions}><a href="#find-support" onClick={()=>setBrowse("psychologists")} className={styles.primary}>{t("primary")}<ArrowUpRight size={18} strokeWidth={1.7} aria-hidden="true"/></a><a href="#find-support" onClick={()=>setBrowse("conditions")} className={styles.secondary}>{t("secondary")}<ForwardArrow/></a></div>
          <div className={styles.trust}><span><ShieldCheck size={16} aria-hidden="true"/>{t("trust1")}</span><span><Video size={16} aria-hidden="true"/>{t("trust2")}</span></div>
        </div>
        <BookingPreview/>
      </section>
      <div className={styles.reminder}><Affirmation/></div>
      </div>
      <section id="find-support" className={styles.directory} aria-labelledby="directory-title">
      <div className={styles.directoryIntroBand}><div className={styles.directoryHeading}><div><p className={styles.eyebrow}>{t("directoryEyebrow")}</p><h2 id="directory-title"><span>{t("directoryTitleStart")}</span>{" "}<span>{t("directoryTitleEnd")}</span></h2><p>{t("directoryIntro")}</p></div><aside className={styles.conversationArt}><Image src="/brand/conversation-chairs.png" width={840} height={460} alt={t("conversationArtAlt")}/><p>{t("conversationArtTitle")}</p><span>{t("conversationArtCaption")}</span></aside></div>
      <div className={styles.tabs} role="group" aria-label={t("browseLabel")}>
        <button type="button" aria-pressed={browse === "psychologists"} onClick={()=>setBrowse("psychologists")}><UserRound size={17} aria-hidden="true"/>{t("browsePsychologists")}</button>
        <button type="button" aria-pressed={browse === "conditions"} onClick={()=>setBrowse("conditions")}><HeartHandshake size={17} aria-hidden="true"/>{t("browseConditions")}</button>
      </div>
      </div>
      <p className={styles.privacyBridge}><PinkyPromiseIcon size={24} aria-hidden="true"/><span>{t("privacy")}</span></p>
      <div className={styles.directoryResults} hidden={browse !== "psychologists"}><PsychologistSearch includeOfficial /></div>
      <div className={styles.directoryResults} hidden={browse !== "conditions"}>{browse === "conditions" && <ConditionDirectory/>}</div>
      </section>
      <UrgentHow/>
      <aside className={styles.closing}><HeartHandshake size={30} strokeWidth={1.4} aria-hidden="true"/><div><h2>{t("footerTitle")}</h2><p>{t("footerText")}</p></div><Link href="/conditions">{t("footerLink")}<ForwardArrow/></Link></aside>
    </div>
  );
}
