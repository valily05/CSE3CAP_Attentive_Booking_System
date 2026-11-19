"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, errorCode } from "@/lib/api";
import { formatDateTime } from "@/lib/time";
import { useAppLocale } from "@/lib/i18n";
import styles from "./Admin.module.css";

type Entry = { at: string; actor: string; action: string; code?: string };

/** The history of changes: who did what, and when (G09-9). */
export function History() {
  const t = useTranslations();
  const locale = useAppLocale();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ entries: Entry[] }>("/api/admin/history").then((r) => setEntries(r.entries), (e) => setError(errorCode(e)));
  }, []);

  const describe = (a: string) => {
    if (a.startsWith("status:")) {
      const to = a.split("→")[1] ?? "";
      return t("admin.action.status", { to: t(`bookings.status.${to}`) });
    }
    return a === "created" || a === "reschedule" || a === "settings" ? t(`admin.action.${a}`) : a;
  };

  if (error) return <p role="alert">{t(`errors.${error}`)}</p>;
  if (entries?.length === 0) return <p className={styles.muted}>{t("admin.historyEmpty")}</p>;
  return (
    <ul className={styles.rows}>
      {entries?.map((e, i) => (
        <li key={i} className={styles.historyRow}>
          <span>{t("admin.historyRow", { actor: e.actor, action: describe(e.action) })}</span>
          {e.code && <span className={styles.code}>{e.code}</span>}
          <time dateTime={e.at} className={styles.muted}>
            {formatDateTime(e.at, locale)}
          </time>
        </li>
      ))}
    </ul>
  );
}
