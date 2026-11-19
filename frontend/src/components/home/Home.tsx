"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PsychologistSearch } from "@/components/search/PsychologistSearch";
import styles from "./Home.module.css";

const STEPS = [1, 2, 3] as const;

export function Home() {
  const t = useTranslations("home");
  const [count, setCount] = useState(0);
  return (
    <div className={styles.home}>
      <section className={styles.hero}>
        <h1>{t("title")}</h1>
        <p className={styles.lede}>{t("lede", { count })}</p>
      </section>
      <PsychologistSearch onCount={setCount} reassurance={<p className={styles.privacy}>{t("privacy")}</p>} />
      <section aria-labelledby="how" className={styles.how}>
        <h2 id="how">{t("howTitle")}</h2>
        <ol>
          {STEPS.map((n) => (
            <li key={n}>
              <h3>{t(`step${n}Title`)}</h3>
              <p>{t(`step${n}`)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
