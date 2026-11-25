"use client";
import { useEffect, useState } from "react";
import styles from "./UrgentHow.module.css";

/** Decorative sample text, never a form field or a submitted name. */
export function PreviewName({ value }: { value: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setTimeout>;
    const start = () => {
      clearTimeout(timer);
      if (motion.matches) { timer = setTimeout(() => setText(value), 0); return; }
      let index = 0;
      const type = () => {
        setText(value.slice(0, index));
        const complete = index === value.length;
        index = complete ? 0 : index + 1;
        timer = setTimeout(type, complete ? 4500 : index === 1 ? 700 : 110);
      };
      timer = setTimeout(type, 0);
    };
    start();
    motion.addEventListener("change", start);
    return () => { clearTimeout(timer); motion.removeEventListener("change", start); };
  }, [value]);
  return <span>{text}<i className={styles.typingCaret}/></span>;
}
