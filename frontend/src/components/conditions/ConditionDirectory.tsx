"use client";

import {ForwardArrow} from "@/components/ui/ForwardArrow";
import Link from "next/link";
import { Search } from "lucide-react";
import { useState } from "react";
import { useAppLocale } from "@/lib/i18n";
import { CONDITIONS } from "@/lib/conditions";
import styles from "./Conditions.module.css";

export function ConditionDirectory() {
  const locale = useAppLocale();
  const id = locale === "id";
  const [query, setQuery] = useState("");
  const [letter, setLetter] = useState("");
  const list = [...CONDITIONS].sort((a,b) => a[locale].name.localeCompare(b[locale].name)).filter(c =>
    (!letter || c[locale].name.startsWith(letter)) &&
    [c[locale].name, ...c.aliases].some(s => s.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  return <section className={styles.directory} aria-labelledby="conditions-title">
    <div>
      <h2 id="conditions-title" className={`${styles.heading} ${styles.directoryTitle}`}><span>{id ? "Temukan dukungan" : "Find support for what"}</span>{" "}<span>{id ? "untuk kondisi Anda" : "you’re experiencing"}</span></h2>
      <p className={styles.intro}>{id ? "Pelajari kondisi kesehatan mental, lalu jelajahi psikolog berdasarkan spesialisasi yang tercantum. Anda tidak perlu memiliki diagnosis untuk mencari dukungan." : "Explore mental health conditions, then find psychologists by their listed specialties. You don’t need a diagnosis to ask for support."}</p>
    </div>
    <div className={styles.controls}>
      <div><h3>{id ? "Cari berdasarkan huruf awal" : "Browse conditions by first letter"}</h3>
        <div className={styles.letters} role="group" aria-label={id ? "Huruf awal kondisi" : "Condition first letter"}>
          {["", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map(l => <button key={l} type="button" aria-pressed={letter===l} disabled={!!l && !CONDITIONS.some(c=>c[locale].name.startsWith(l))} onClick={()=>setLetter(l)}>{l || (id ? "Semua" : "All")}</button>)}
        </div>
      </div>
      <div><label htmlFor="condition-search">{id ? "Jelajahi topik untuk Anda" : "Explore topics for you"}</label><div className={styles.search}><Search size={20} aria-hidden="true"/><input id="condition-search" type="search" value={query} onChange={e=>{setQuery(e.target.value);setLetter("");}} placeholder={id ? "Apa yang ingin Anda pahami?" : "What would you like to understand?"}/></div></div>
    </div>
    <p aria-live="polite" className={styles.sources}>{id ? `${list.length} panduan ditemukan` : `${list.length} guides found`}</p>
    {list.length===0 && <p>{id ? "Belum ada panduan yang sesuai. Coba kata lain atau pilih Semua." : "No guides match. Try another search or choose All."} <button type="button" className="button" onClick={()=>{setQuery("");setLetter("");}}>{id ? "Hapus filter" : "Clear filters"}</button></p>}
    <ul className={styles.cards}>{list.map(c=><li key={c.slug}><Link className={styles.card} href={`/conditions/${c.slug}`}><h3>{c[locale].name}</h3><p>{c[locale].overview}</p><span>{id ? "Baca panduan & temukan dukungan" : "Read guide & find support"} <ForwardArrow/></span></Link></li>)}</ul>
    <p className={styles.sources}>{id ? "Informasi edukasi berdasarkan sumber NIMH. Bukan alat diagnosis." : "Educational information based on NIMH resources. This is not a diagnostic tool."}</p>
  </section>;
}
