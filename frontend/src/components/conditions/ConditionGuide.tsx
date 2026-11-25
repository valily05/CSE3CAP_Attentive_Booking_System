"use client";
/* eslint-disable attentive/no-clinical-fields -- Section anchors for public health education, not patient data fields. */

import Link from "next/link";
import { useAppLocale } from "@/lib/i18n";
import type { Condition } from "@/lib/conditions";
import { PsychologistSearch } from "@/components/search/PsychologistSearch";
import styles from "./Conditions.module.css";

export function ConditionGuide({ condition }: { condition: Condition }) {
  const sourceName = "National Institute of Mental Health";
  const locale = useAppLocale(); const id = locale === "id"; const copy = condition[locale];
  const sections = [
    { key: "overview", title: id ? "Gambaran umum" : "Overview", text: copy.overview },
    { key: "symptoms", title: id ? "Tanda & gejala" : "Signs & symptoms", text: copy.symptoms },
    { key: "help", title: id ? "Kapan perlu menemui profesional" : "When to see a doctor", text: copy.help },
    { key: "causes", title: id ? "Penyebab" : "Causes", text: copy.causes },
    { key: "risks", title: id ? "Faktor risiko" : "Risk factors", text: copy.risks },
    { key: "care", title: id ? "Asesmen & perawatan" : "Assessment & treatment", text: copy.care },
  ];
  return <article className={styles.guide}>
    <Link href="/conditions" className={styles.back}>← {id ? "Semua kondisi" : "All conditions"}</Link>
    <header className={styles.hero}><p className={styles.eyebrow}>{id ? "Memahami kesehatan mental" : "Understanding mental health"}</p><h1>{copy.name}</h1><p>{copy.overview}</p><a className="button" href="#condition-psychologists">{id ? "Lihat psikolog terkait" : "Explore matching psychologists"} ↓</a></header>
    <div className={styles.body}>
      <nav className={styles.contents} aria-label={id ? "Isi panduan" : "In this guide"}><strong>{id ? "Di halaman ini" : "In this guide"}</strong>{sections.map(s=><a key={s.key} href={`#${s.key}`}>{s.title}</a>)}<a href="#condition-psychologists">{id ? "Temukan dukungan" : "Find support"}</a></nav>
      <div className={styles.sections}>{sections.map(s=><section id={s.key} key={s.key}><h2>{s.title}</h2><p>{s.text}</p></section>)}
        <p className={styles.note}>{id ? "Panduan ini untuk edukasi, bukan diagnosis atau pengganti konsultasi. Gejala dapat tumpang tindih. Jika ada bahaya langsung atau Anda tidak dapat menjaga keselamatan diri, cari pertolongan darurat setempat atau kunjungi IGD terdekat. Pemesanan di situs ini bukan layanan darurat." : "This guide is educational and does not replace a diagnosis or consultation. Symptoms can overlap. If there is immediate danger or you cannot stay safe, seek local emergency care or go to the nearest emergency department. Website bookings are not an emergency service."}</p>
        <p className={styles.sources}>{id ? "Sumber: " : "Source: "}<a href={condition.source} target="_blank" rel="noreferrer">{sourceName} — {condition.en.name} ↗</a><br/>{id ? "Ringkasan diperbarui 23 November 2026." : "Summary updated 23 November 2026."}</p>
      </div>
    </div>
    <section id="condition-psychologists" className={styles.recommendations} aria-labelledby="matching-title"><div><p className={styles.eyebrow}>{id ? "Langkah berikutnya" : "Your next step"}</p><h2 id="matching-title" className={styles.heading}>{id ? `Dukungan untuk ${copy.name}` : `Support for ${copy.name}`}</h2><p className={styles.intro}>{id ? "Hasil mencocokkan kata kunci kondisi dengan spesialisasi yang tercantum di profil, bukan rekomendasi klinis. Konfirmasikan pengalaman dan kecocokan dengan psikolog sebelum memesan." : "Results match condition keywords with specialties listed on profiles; they are not clinical endorsements. Confirm experience and suitability with the psychologist before booking."}</p></div><PsychologistSearch condition={condition}/></section>
  </article>;
}

