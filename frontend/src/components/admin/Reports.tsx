"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { api, errorCode } from "@/lib/api";
import { todayKey, weekStart } from "@/lib/time";
import { useDirectory } from "./useDirectory";
import styles from "./Admin.module.css";

type Totals = { Sessions: number; Attended: number; NoShows: number; Cancellations: number; NoShowRate: number };
type Report = { totals: Totals; byPsychologist: Record<string, Totals>; byPlace: Record<string, Totals>; byService: Record<string, Totals> };

/** G09-10: numbers only, never client names. */
export function Reports({ today = todayKey() }: { today?: string }) {
  const t = useTranslations("admin");
  const te = useTranslations("errors");
  const { catalog } = useDirectory();
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [start, setStart] = useState(() => weekStart(today));
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const totalsId = useId();

  useEffect(() => {
    api.get<Report>(`/api/admin/reports?period=${period}&start=${start}`).then(setReport, (e) => setError(errorCode(e)));
  }, [period, start]);

  const placeName = (k: string) => (k === "online" ? t("online") : (catalog.locations.find((l) => l.id === k)?.name ?? k));
  const serviceName = (k: string) => catalog.services.find((s) => s.id === k)?.name ?? k;

  return (
    <div className={styles.stack}>
      <div className={styles.filters}>
        <label className="field">
          <span>{t("period")}</span>
          <select
            value={period}
            onChange={(e) => {
              const p = e.target.value as "week" | "month";
              setPeriod(p);
              setStart(p === "week" ? weekStart(today) : `${today.slice(0, 7)}-01`);
            }}
          >
            <option value="week">{t("periodWeek")}</option>
            <option value="month">{t("periodMonth")}</option>
          </select>
        </label>
        <label className="field">
          <span>{t("startDate")}</span>
          <input type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </label>
      </div>
      {error && <p role="alert">{te(error)}</p>}
      {report && (
        <>
          <section aria-labelledby={totalsId} className={styles.totals}>
            <h2 id={totalsId} className="visually-hidden">
              {period === "week" ? t("periodWeek") : t("periodMonth")}
            </h2>
            <dl>
              <div>
                <dt>{t("sessions")}</dt>
                <dd>{report.totals.Sessions}</dd>
              </div>
              <div>
                <dt>{t("cancellations")}</dt>
                <dd>{report.totals.Cancellations}</dd>
              </div>
              <div>
                <dt>{t("noShowRate")}</dt>
                <dd>{t("noShowRateValue", { rate: report.totals.NoShowRate })}</dd>
              </div>
            </dl>
            <p className={styles.muted}>{t("reportNote")}</p>
          </section>
          <Breakdown title={t("byPsychologist")} rows={report.byPsychologist} label={(k) => k} />
          <Breakdown title={t("byPlace")} rows={report.byPlace} label={placeName} />
          <Breakdown title={t("byService")} rows={report.byService} label={serviceName} />
        </>
      )}
    </div>
  );
}

function Breakdown({ title, rows, label }: { title: string; rows: Record<string, Totals>; label: (k: string) => string }) {
  const t = useTranslations("admin");
  // One scale per table, from zero: bars compare psychologists (or places) with each other.
  const max = Math.max(1, ...Object.values(rows).map((v) => v.Sessions));
  return (
    <table className={styles.table}>
      <caption>{title}</caption>
      <thead>
        <tr>
          <td />
          <th scope="col">{t("sessions")}</th>
          <th scope="col">{t("cancellations")}</th>
          <th scope="col">{t("noShowRate")}</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(rows)
          .sort(([a], [b]) => label(a).localeCompare(label(b)))
          .map(([k, v]) => (
            <tr key={k}>
              <th scope="row">{label(k)}</th>
              <td>
                <span className={styles.databar}>
                  <i aria-hidden="true" style={{ width: `${(v.Sessions / max) * 100}%` }} />
                  <span>{v.Sessions}</span>
                </span>
              </td>
              <td>{v.Cancellations}</td>
              <td>
                <span className={styles.meter}>
                  <span aria-hidden="true" className={styles.track}>
                    <i style={{ width: `${Math.min(100, v.NoShowRate)}%` }} />
                  </span>
                  <span>{t("noShowRateValue", { rate: v.NoShowRate })}</span>
                </span>
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}
