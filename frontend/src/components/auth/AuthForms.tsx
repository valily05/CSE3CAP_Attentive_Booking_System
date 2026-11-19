"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { api, errorCode } from "@/lib/api";
import { useAppLocale } from "@/lib/i18n";
import type { Me, Role } from "@/lib/types";
import { Field } from "@/components/ui/Field";
import styles from "./AuthForms.module.css";

/** Where a role lands after signing in. `next` is followed only if it is a local path. */
export function homeFor(role: Role, next?: string | null): string {
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  switch (role) {
    case "admin":
      return safe ?? "/admin";
    case "psychologist":
      return safe ?? "/schedule";
    default:
      return safe ?? "/bookings";
  }
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorCode(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function ErrorLine({ code }: { code: string | null }) {
  const t = useTranslations("errors");
  return code ? (
    <p role="alert" className={styles.error}>
      {t(code)}
    </p>
  ) : null;
}

export function SignUpForm() {
  const t = useTranslations("auth");
  const locale = useAppLocale();
  const { busy, error, run } = useSubmit();
  const [sentTo, setSentTo] = useState<string | null>(null);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    void run(async () => {
      await api.post("/api/auth/signup", {
        name: f.get("name"),
        email,
        phone: f.get("phone"),
        password: f.get("password"),
        agreedPrivacy: f.get("privacy") === "on",
        checkInConsent: f.get("checkIn") === "on",
        locale,
      });
      setSentTo(email);
    });
  }

  if (sentTo) return <p className={styles.done}>{t("checkEmail", { email: sentTo })}</p>;

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className="field">
        <span>{t("name")}</span>
        <input name="name" autoComplete="name" required />
      </label>
      <label className="field">
        <span>{t("email")}</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <Field label={t("phone")} hint={t("phoneHint")} name="phone" type="tel" autoComplete="tel" inputMode="tel" required />
      <Field label={t("password")} hint={t("passwordHint")} name="password" type="password" autoComplete="new-password" minLength={8} required />
      <label className={styles.check}>
        <input type="checkbox" name="privacy" required />
        <span>{t.rich("privacy", { link: (c) => <Link href="/privacy">{c}</Link> })}</span>
      </label>
      <label className={styles.check}>
        <input type="checkbox" name="checkIn" aria-describedby="checkin-hint" />
        <span>
          {t("checkIn")}
          <small id="checkin-hint">{t("checkInHint")}</small>
        </span>
      </label>
      <ErrorLine code={error} />
      <button className="button" disabled={busy}>
        {t("submitSignUp")}
      </button>
      <p className={styles.alt}>{t.rich("haveAccount", { link: (c) => <Link href="/signin">{c}</Link> })}</p>
    </form>
  );
}

export function SignInForm({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const t = useTranslations("auth");
  const { busy, error, run } = useSubmit();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(async () => onSignedIn(await api.post<Me>("/api/auth/login", { email: f.get("email"), password: f.get("password") })));
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className="field">
        <span>{t("email")}</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label className="field">
        <span>{t("password")}</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <ErrorLine code={error} />
      <button className="button" disabled={busy}>
        {t("submitSignIn")}
      </button>
      <p className={styles.alt}>
        <Link href="/forgot">{t("forgot")}</Link>
      </p>
      <p className={styles.alt}>{t.rich("noAccount", { link: (c) => <Link href="/signup">{c}</Link> })}</p>
    </form>
  );
}

export function ForgotForm() {
  const t = useTranslations("auth");
  const locale = useAppLocale();
  const { busy, error, run } = useSubmit();
  const [sent, setSent] = useState(false);
  if (sent) return <p className={styles.done}>{t("linkSent")}</p>;
  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        const email = new FormData(e.currentTarget).get("email");
        void run(async () => {
          await api.post("/api/auth/forgot", { email, locale });
          setSent(true);
        });
      }}
    >
      <p>{t("forgotBody")}</p>
      <label className="field">
        <span>{t("email")}</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <ErrorLine code={error} />
      <button className="button" disabled={busy}>
        {t("sendLink")}
      </button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const { busy, error, run } = useSubmit();
  const [saved, setSaved] = useState(false);
  if (saved)
    return (
      <p className={styles.done}>
        {t("passwordSaved")} <Link href="/signin">{t("submitSignIn")}</Link>
      </p>
    );
  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        const password = new FormData(e.currentTarget).get("password");
        void run(async () => {
          await api.post("/api/auth/reset", { token, password });
          setSaved(true);
        });
      }}
    >
      <label className="field">
        <span>{t("newPassword")}</span>
        <input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      <ErrorLine code={error} />
      <button className="button" disabled={busy}>
        {t("savePassword")}
      </button>
    </form>
  );
}

/** Confirms an email or unsubscribes from a link, as soon as the page opens. */
export function TokenAction({ path, token, pending, success }: { path: string; token: string; pending: string; success: string }) {
  const t = useTranslations();
  const [state, setState] = useState<"pending" | "ok" | string>("pending");
  const [started, setStarted] = useState(false);
  if (!started) {
    setStarted(true);
    api.post(path, { token }).then(
      () => setState("ok"),
      (e) => setState(errorCode(e)),
    );
  }
  if (state === "pending") return <p>{t(pending)}</p>;
  if (state === "ok") return <p className={styles.done}>{t(success)}</p>;
  return (
    <p role="alert" className={styles.error}>
      {t(`errors.${state}`)}
    </p>
  );
}
