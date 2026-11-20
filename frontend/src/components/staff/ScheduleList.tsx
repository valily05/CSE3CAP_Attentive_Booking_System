"use client";
import { UrgentBadge } from "@/components/urgent/UrgentBadge";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, errorCode } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { addDays, dateKey, formatDate, formatTime, weekStart } from "@/lib/time";
import { useAppLocale } from "@/lib/i18n";
import type { Booking } from "@/lib/types";
import styles from "./Staff.module.css";

/** "My schedule" (G09-3): the psychologist's own sessions, client first names only. */
export function ScheduleList({ now = new Date() }: { now?: Date }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const [from, setFrom] = useState(() => weekStart(dateKey(now)));
  const res = useApi<{ bookings: Booking[] }>(`/api/psy/schedule?from=${from}&to=${addDays(from, 6)}`);
  const list = res.data?.bookings ?? null;
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError ?? res.error ?? null;

  async function mark(id: string, status: "attended" | "no_show") {
    try {
      await api.post(`/api/bookings/${id}/attendance`, { status });
      setError(null);
      res.reload();
    } catch (e) {
      setError(errorCode(e));
    }
  }

  const byDay = new Map<string, Booking[]>();
  for (const b of list ?? []) byDay.set(dateKey(b.start), [...(byDay.get(dateKey(b.start)) ?? []), b]);

  return (
    <div className={styles.stack}>
      <div className={styles.toolbar}>
        <button type="button" className="button-quiet" onClick={() => setFrom(addDays(from, -7))}>
          {t("psy.prev")}
        </button>
        <span className={styles.range}>{t("profile.weekOf", { date: formatDate(`${from}T05:00:00Z`, locale) })}</span>
        <button type="button" className="button-quiet" onClick={() => setFrom(addDays(from, 7))}>
          {t("psy.next")}
        </button>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {t(`errors.${error}`)}
        </p>
      )}
      {list?.length === 0 && <p className={styles.muted}>{t("psy.empty")}</p>}
      {[...byDay].map(([day, items]) => (
        <section key={day} aria-label={formatDate(`${day}T05:00:00Z`, locale)}>
          <h2 className={styles.day}>{formatDate(`${day}T05:00:00Z`, locale)}</h2>
          <ul className={styles.rows}>
            {items.map((b) => (
              <li key={b.id} className={styles.row}>
                <span className={styles.time}>{formatTime(b.start, locale)}</span>
                <span>
                  {b.clientName}, {b.serviceName}, {b.mode === "online" ? t(`sessionType.${b.onlineChannel ?? "video"}`) : b.locationName}
                </span>
                <span className={styles.code}>{b.code}</span><UrgentBadge urgent={b.isUrgent} />
                {b.status === "confirmed" && new Date(b.start) <= now ? (
                  <span className={styles.actions}>
                    <button type="button" className="button-quiet" onClick={() => mark(b.id, "attended")}>
                      {t("psy.markAttended")}
                    </button>
                    <button type="button" className="button-quiet" onClick={() => mark(b.id, "no_show")}>
                      {t("psy.markNoShow")}
                    </button>
                  </span>
                ) : (
                  <span className={styles.status} data-status={b.status}>
                    {t(`bookings.status.${b.status}`)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
