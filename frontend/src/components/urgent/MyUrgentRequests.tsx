"use client";
import { useTranslations } from "next-intl";
import { useApi } from "@/lib/useApi";
import { useAppLocale } from "@/lib/i18n";
import { formatFullDateTime as formatDateTime } from "@/lib/time";
import type { UrgentRequest } from "./types";
import styles from "./Urgent.module.css";
export function MyUrgentRequests() {
 const t = useTranslations("urgent");
 const errors = useTranslations("errors");
 const locale = useAppLocale();
 const { data, error } = useApi<{ requests: UrgentRequest[] }>("/api/me/urgent-requests");
 if (error) return <p role="alert">{errors(error)}</p>;
 if (!data?.requests.length) return null;
 return <section className={styles.card}><h2>{t("requestHistory")}</h2><ul className={styles.list}>
  {data.requests.map((request) => <li key={request.id}>
   <span className={styles.badge}>{t("badge")}</span> <strong>{request.bookingCode}</strong>
   <p>{t(`statuses.${request.status}`)} · {formatDateTime(request.workflow.submittedAt, locale)}</p>
  </li>)}
 </ul></section>;
}
