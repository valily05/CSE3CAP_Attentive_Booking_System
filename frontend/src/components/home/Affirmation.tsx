"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import styles from "./Affirmation.module.css";

export function Affirmation() {
  const t = useTranslations("home.affirmations");
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(timer);
      if (!motion.matches) timer = setInterval(() => setIndex(i => (i + 1) % 4), 8000);
    };
    start();
    motion.addEventListener("change", start);
    return () => { clearInterval(timer); motion.removeEventListener("change", start); };
  }, []);
  return <div className={styles.affirmation}>
    <span key={index} className={styles.sentence}>&ldquo;{t(String(index))}&rdquo;</span>
  </div>;
}
