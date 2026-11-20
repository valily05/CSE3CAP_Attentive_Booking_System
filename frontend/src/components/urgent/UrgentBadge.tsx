"use client";
import { useTranslations } from "next-intl";
import styles from "./Urgent.module.css";
export function UrgentBadge({ urgent }: { urgent?: boolean }) {
 const t = useTranslations("urgent");
 return urgent ? <span className={styles.badge}>{t("badge")}</span> : null;
}
