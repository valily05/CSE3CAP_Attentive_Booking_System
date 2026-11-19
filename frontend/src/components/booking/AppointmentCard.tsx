"use client";

import Link from "next/link";
import { useId } from "react";
import { useTranslations } from "next-intl";
import styles from "./AppointmentCard.module.css";

type Props = { code: string; psychologist: string; when: string; where: string; deadline: string };

/** The tear-off appointment card people keep (and screenshot). */
export function AppointmentCard({ code, psychologist, when, where, deadline }: Props) {
  const t = useTranslations("card");
  const id = useId();
  return (
    <section aria-labelledby={id} className={styles.card}>
      <div className={styles.body}>
        <h2 id={id}>{t("title")}</h2>
        <dl>
          <dt>{t("with")}</dt>
          <dd>{psychologist}</dd>
          <dt>{t("when")}</dt>
          <dd>{when}</dd>
          <dt>{t("where")}</dt>
          <dd>{where}</dd>
        </dl>
        <p className={styles.keep}>{t("keep", { deadline })}</p>
        <Link href="/bookings" className="button">
          {t("toBookings")}
        </Link>
      </div>
      <div className={styles.stub}>
        <span className={styles.stubLabel}>{t("code")}</span>
        <span className={styles.code}>{code}</span>
      </div>
    </section>
  );
}
