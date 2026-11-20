"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MapPin, Video } from "lucide-react";
import { api, errorCode } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { UrgentReceipt } from "./types";
import { useAppLocale } from "@/lib/i18n";
import { saveUrgentNotification } from "@/lib/urgentNotifications";
import styles from "./Urgent.module.css";

export function UrgentForm() {
  const t = useTranslations("urgent");
  const errors = useTranslations("errors");
  const router = useRouter();
  const locale = useAppLocale();
  const { data, error: catalogError } = useApi<{ locations: { id: string; name: string; active: boolean }[] }>("/api/catalog");
  const [mode, setMode] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const submissionKey = useRef("");
  const [recent, setRecent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    const fields = new FormData(event.currentTarget);
    const phone = String(fields.get("phone") ?? "").replace(/[\s()-]/g, "").replace(/^0/, "");
    if (!submissionKey.current) {
      try { submissionKey.current = sessionStorage.getItem("urgent-submission-draft") || ""; } catch { /* Storage is optional. */ }
      if (!submissionKey.current) {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        submissionKey.current = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
      }
      try { sessionStorage.setItem("urgent-submission-draft", submissionKey.current); } catch { /* The in-memory key still protects retries. */ }
    }
    try {
      const result = await api.post<{ request: UrgentReceipt; token: string }>("/api/urgent-requests", {
        customerName: fields.get("name"),
        email: fields.get("email"),
        whatsappNumber: phone ? String(fields.get("country")) + phone : "",
        sessionType: mode,
        locationId: mode === "onsite" ? fields.get("location") : "",
        acknowledged,
        submissionKey: submissionKey.current,
        locale,
      });
      // The token travels in a fragment, outside server logs and referrer headers.
      saveUrgentNotification(result.request, result.token);
      try {
        sessionStorage.setItem("urgent-owner-" + result.request.bookingCode, result.token);
        sessionStorage.removeItem("urgent-submission-draft");
        localStorage.setItem("urgent-recent-email", JSON.stringify({ email: String(fields.get("email")).trim().toLowerCase(), submittedAt: result.request.workflow.submittedAt }));
      } catch { /* The confirmation fragment remains usable when storage is disabled. */ }
      router.push(`/urgent-confirmation/${result.request.bookingCode}#${result.token}`);
    } catch (exception) {
      setError(errorCode(exception));
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1>{t("title")}</h1>
      <p className={styles.muted}>{t("subtitle")}</p>
      <form className={styles.card} onSubmit={submit}>
        <label className="field"><span>{t("name")}</span><input name="name" autoComplete="name" maxLength={160} required /></label>
        <label className="field"><span>{t("email")}</span><input name="email" type="email" autoComplete="email" maxLength={254} required onBlur={(event) => {
          try {
            const previous = JSON.parse(localStorage.getItem("urgent-recent-email") || "null");
            setRecent(previous?.email === event.target.value.trim().toLowerCase() && Date.now() - Date.parse(previous.submittedAt) < 86400000);
          } catch { setRecent(false); }
        }} /></label>
        {recent && <p className={styles.warning}>{t("repeatWarning")}</p>}
        <div className="field">
          <label htmlFor="urgent-phone">{t("phone")}</label>
          <div className={styles.phone}>
            <select name="country" defaultValue="+62" aria-label={t("country")}>
              {["+62", "+60", "+65", "+61", "+1", "+44", "+91", "+81"].map((code) => <option key={code}>{code}</option>)}
            </select>
            <input id="urgent-phone" name="phone" type="tel" autoComplete="tel-national" inputMode="tel" pattern="[0-9 ()-]{6,20}" aria-describedby="urgent-phone-hint" />
          </div>
          <small id="urgent-phone-hint">{t("phoneHint")}</small>
        </div>
        <fieldset className={styles.card}>
          <legend>{t("session")}</legend>
          <div className={styles.choices}>
            <label className={styles.choice}><input type="radio" name="session" value="online" checked={mode === "online"} onChange={() => setMode("online")} required /><span><Video size={22} />{t("online")}</span></label>
            <label className={styles.choice}><input type="radio" name="session" value="onsite" checked={mode === "onsite"} onChange={() => setMode("onsite")} required /><span><MapPin size={22} />{t("onsite")}</span></label>
          </div>
        </fieldset>
        {mode === "onsite" && <div className="field"><label htmlFor="urgent-location">{t("location")}</label><select id="urgent-location" name="location" defaultValue="" required>
          <option value="" disabled>{t("chooseLocation")}</option>
          {data?.locations.filter((location) => location.active).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>{catalogError && <small role="alert">{errors(catalogError)}</small>}</div>}
        <section className={styles.warning}>
          <h2>{t("warningTitle")}</h2>
          <p>{t("warning")}</p>
          <label className={styles.ack}><input type="checkbox" required checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>{t("acknowledgement")}</span></label>
        </section>
        {error && <p role="alert" className={styles.error}>{errors(error)}</p>}
        <button className="button" aria-busy={busy} disabled={!acknowledged || busy}>{t(busy ? "saving" : "submit")}</button>
      </form>
    </div>
  );
}
