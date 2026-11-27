"use client";

import {showToast} from "@/lib/toast";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { PhoneCall, UserRound, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { rememberLocale } from "@/lib/locale";
import type { Role } from "@/lib/types";
import { useSession } from "./Session";
import styles from "./Header.module.css";
import { UrgentNotifications } from "./UrgentNotifications";

const NAV: Record<Role | "guest", { href: string; key: string }[]> = {
  guest: [{ href: "/", key: "find" }, { href: "/signin?next=/bookings", key: "myBookings" }, { href: "/history", key: "myHistory" }],
  client: [
    { href: "/", key: "find" },
    { href: "/bookings", key: "myBookings" },
    { href: "/history", key: "myHistory" },
  ],
  psychologist: [
    { href: "/schedule", key: "mySchedule" },
    { href: "/hours", key: "myHours" },
    { href: "/history", key: "myHistory" },
  ],
  admin: [
    { href: "/admin", key: "calendar" },
    { href: "/history", key: "myHistory" },
    { href: "/admin/new", key: "newBooking" },
    { href: "/admin/hours", key: "myHours" },
    { href: "/admin/reports", key: "reports" },
    { href: "/admin/settings", key: "settings" },
    { href: "/admin/history", key: "history" },
    { href: "/admin/urgent-requests", key: "urgentRequests" },
  ],
};

export function Header() {
  const t = useTranslations();
  const locale = useLocale();
  const path = usePathname();
  const router = useRouter();
  const { me, signOut } = useSession();
  const links = NAV[me?.role ?? "guest"];
  const [accountOpen,setAccountOpen]=useState(false);
  const [signingOut,setSigningOut]=useState(false);
  const [accountError,setAccountError]=useState(false);
  const account=useRef<HTMLDivElement>(null);
  const accountButton=useRef<HTMLButtonElement>(null);
  const logoutButton=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!accountOpen)return;
    logoutButton.current?.focus();
    const outside=(e:PointerEvent)=>{if(!account.current?.contains(e.target as Node))setAccountOpen(false);};
    const escape=(e:KeyboardEvent)=>{if(e.key==="Escape"){setAccountOpen(false);accountButton.current?.focus();}};
    document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
    return ()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};
  },[accountOpen]);

  const switchTo = (l: "id" | "en") => {
    rememberLocale(l);
    router.refresh();
  };

  const toggleTheme = () => {
    const root = document.documentElement;
    const current = root.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    root.dataset.theme = next;
  };

  if (path.startsWith("/admin") || path === "/forgot" || path === "/reset-password" || path === "/signin" || path === "/verify" || path === "/signup" || path === "/resend-verification" || path === "/account/residence") return null;

  return (
    <header className={styles.header}>
      <a href="#main" className={styles.skip}>
        {t("nav.skip")}
      </a>
      <Link href={me?.role === "admin" ? "/admin" : me?.role === "psychologist" ? "/schedule" : "/"} className={styles.brand} aria-label={t("brand")}>
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
        <UrgentNotifications />
        <button type="button" className={styles.theme} title={t("theme.toggle")} aria-label={t("theme.toggle")} onClick={toggleTheme}>
          <span className={styles.themeIcon} aria-hidden="true" />
        </button>
        <div role="group" aria-label={t("locale.label")} className={styles.lang}>
          {(["en", "id"] as const).map((l) => (
            <button key={l} type="button" lang={l} aria-label={t(`locale.${l}`)} aria-pressed={locale === l} onClick={() => switchTo(l)}>
              {t(l === "id" ? "locale.shortId" : "locale.shortEn")}
            </button>
          ))}
        </div>
        <Link href="/urgent-scheduling" className={styles.urgent} aria-label={t("urgent.nav")}><PhoneCall size={17} aria-hidden="true" /><span className={styles.urgentLabel}>{t("urgent.nav")}</span></Link>
        {me ? (
          <div className={styles.account} ref={account} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setAccountOpen(false);}}>
            <button ref={accountButton} type="button" className={styles.profile} aria-label={t("nav.profile")} aria-expanded={accountOpen} aria-controls="account-panel" onClick={()=>{setAccountOpen(o=>!o);setAccountError(false);}}><UserRound size={19} aria-hidden="true"/></button>
            {accountOpen&&<div id="account-panel" className={styles.accountPanel}>
              <strong>{me.name}</strong><p>{me.email}</p>
 {me.role==="client"&&<Link href="/account/profile" className={styles.profileLink} onClick={()=>setAccountOpen(false)}><UserRound size={16}/>{t("profile.title")}</Link>}
              <button ref={logoutButton} type="button" disabled={signingOut} onClick={async()=>{
                setSigningOut(true);setAccountError(false);
                try{await signOut();setAccountOpen(false);router.push("/");}catch{setAccountError(true);showToast(t("errors.network"),true);}finally{setSigningOut(false);}
              }}><LogOut size={17} aria-hidden="true"/>{t("nav.signOut")}</button>
              {accountError&&<p role="alert">{t("errors.network")}</p>}
            </div>}
          </div>
        ) : (
          <Link href={path==="/signin"?"/signup":"/signin"} className={`${styles.auth} ${path==="/signin"?styles.createAccount:styles.signIn}`} aria-label={t(path==="/signin"?"nav.createAccount":"nav.signIn")}>
            <UserRound className={styles.authIcon} size={18} aria-hidden="true"/><span className={styles.authLabel}>{t(path==="/signin"?"nav.createAccount":"nav.signIn")}</span>
          </Link>
        )}
      </div>
    </header>
  );
}
