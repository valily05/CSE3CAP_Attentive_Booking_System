"use client";

import Link from "next/link";
import Image from "next/image";
import {ArrowLeft} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, errorCode } from "@/lib/api";
import type { Catalog, Psychologist } from "@/lib/types";
import { useSession } from "@/components/shell/Session";
import { BookingFlow } from "./BookingFlow";
import styles from "./ProfilePage.module.css";

export function ProfilePage({ id }: { id: string }) {
  const t = useTranslations();
  const { me, ready } = useSession();
  const [p, setP] = useState<Psychologist | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [returnQuery]=useState(()=>typeof window==="undefined"?"":window.location.search);
  const [booked,setBooked]=useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Psychologist>(`/api/psychologists/${id}`).then(setP, (e) => setError(errorCode(e)));
    api.get<Catalog>("/api/catalog").then(setCatalog, (e) => setError(errorCode(e)));
  }, [id]);

  if (error) return <p role="alert">{t(`errors.${error}`)}</p>;
  if (!p || !catalog || !ready) return <p>{t("common.loading")}</p>;

  const offered = catalog.services.filter((s) => p.serviceIds.includes(s.id));
  const places = p.locationIds.map((id) => catalog.locations.find((l) => l.id === id)?.name ?? id);
  return (
    <div className={styles.page}>
      {!booked&&<>
      <Link href="/" className={styles.back}>
        <ArrowLeft size={16}/> {t("profile.back")}
      </Link>
      <header className={styles.header}>
        <span className={styles.avatar} aria-hidden="true">
          {p.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- photos come from admin-entered URLs
            <img src={p.photoUrl} alt="" />
          ) : (
            p.name
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0])
              .join("")
          )}
        </span>
        <div className={styles.intro}>
          <h1>{t("profile.title", { name: p.name })}</h1>
          <p>
            {p.title}
            {p.specialty ? `. ${p.specialty}` : ""}
          </p>
        <ul className={styles.chips}>
          {p.sessionTypes
            .filter((s) => s !== "in_person")
            .map((s) => (
              <li key={s}>{t(`sessionType.${s}`)}</li>
            ))}
          {places.map((pl) => (
            <li key={pl}>{pl}</li>
          ))}
          {offered.map((s) => (
            <li key={s.id}>{t(`ageGroupName.${s.ageGroup}`)}</li>
          ))}
        </ul>
        </div>
        <div className={styles.headerArt} aria-hidden="true"><Image src="/brand/booking-calendar-flat.png" alt="" width={1536} height={1024} sizes="(max-width: 560px) 120px, 200px"/></div>
      </header>
      </>}
      {me?<BookingFlow psychologist={p} catalog={catalog} me={me.role === "client" ? me : null} onBooked={()=>setBooked(true)} />:<div className={styles.signInCard}><p>{t("directory.signInSchedule")}</p><Link className="button" href={`/signin?next=${encodeURIComponent(`/psychologists/${p.id}${returnQuery}`)}`}>{t("directory.signInBook")}</Link></div>}
    </div>
  );
}
