"use client";

import Link from "next/link";
import {CalendarCheck,UserRound,Clock3,MapPin,ArrowUpRight,Ticket} from "lucide-react";
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
        <span className={styles.successIcon}><CalendarCheck size={27} aria-hidden="true"/></span>
        <h2 id={id}>{t("title")}</h2>
        <dl>
          <dt><UserRound size={17} aria-hidden="true"/>{t("with")}</dt>
          <dd>{psychologist}</dd>
          <dt><Clock3 size={17} aria-hidden="true"/>{t("when")}</dt>
          <dd>{when}</dd>
          <dt><MapPin size={17} aria-hidden="true"/>{t("where")}</dt>
          <dd>{where}</dd>
        </dl>
        <p className={styles.keep}>{t("keep", { deadline })}</p>
        <Link href="/bookings" className="button">
          {t("toBookings")}<ArrowUpRight size={17} aria-hidden="true"/>
        </Link>
      </div>
      <div className={styles.stub}>
        <Ticket size={27} strokeWidth={1.4} aria-hidden="true"/><span className={styles.stubLabel}>{t("code")}</span>
        <span className={styles.code}>{code}</span>
      </div>
    </section>
  );
}
