"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { rememberLocale } from "@/lib/locale";
import type { Role } from "@/lib/types";
import { useSession } from "./Session";
import styles from "./Header.module.css";

const NAV: Record<Role | "guest", { href: string; key: string }[]> = {
  guest: [{ href: "/", key: "find" }],
  client: [
    { href: "/", key: "find" },
    { href: "/bookings", key: "myBookings" },
  ],
  psychologist: [
    { href: "/schedule", key: "mySchedule" },
    { href: "/hours", key: "myHours" },
  ],
  admin: [
    { href: "/admin", key: "calendar" },
    { href: "/admin/new", key: "newBooking" },
    { href: "/admin/hours", key: "myHours" },
    { href: "/admin/reports", key: "reports" },
    { href: "/admin/settings", key: "settings" },
    { href: "/admin/history", key: "history" },
  ],
};

export function Header() {
  const t = useTranslations();
  const locale = useLocale();
  const path = usePathname();
  const router = useRouter();
  const { me, signOut } = useSession();
  const links = NAV[me?.role ?? "guest"];

  const switchTo = (l: "id" | "en") => {
    rememberLocale(l);
    router.refresh();
  };

  return (
    <header className={styles.header}>
      <a href="#main" className={styles.skip}>
        {t("nav.skip")}
      </a>
      <Link href={me?.role === "admin" ? "/admin" : me?.role === "psychologist" ? "/schedule" : "/"} className={styles.brand}>
        <Image src="/brand/attentive-logo.webp" alt={t("brand")} width={528} height={144} priority className={styles.logo} />
      </Link>
      <nav aria-label={t("nav.menu")} className={styles.nav}>
        <ul>
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} aria-current={path === l.href ? "page" : undefined}>
                {l.key === "newBooking" ? t("admin.newBooking") : t(`nav.${l.key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className={styles.tools}>
        <div role="group" aria-label={t("locale.label")} className={styles.lang}>
          {(["id", "en"] as const).map((l) => (
            <button key={l} type="button" lang={l} aria-label={t(`locale.${l}`)} aria-pressed={locale === l} onClick={() => switchTo(l)}>
              {t(l === "id" ? "locale.shortId" : "locale.shortEn")}
            </button>
          ))}
        </div>
        {me ? (
          <button
            type="button"
            className="button-quiet"
            onClick={async () => {
              await signOut();
              router.push("/");
            }}
          >
            {t("nav.signOut")}
          </button>
        ) : (
          <Link href="/signin" className="button-quiet">
            {t("nav.signIn")}
          </Link>
        )}
      </div>
    </header>
  );
}
