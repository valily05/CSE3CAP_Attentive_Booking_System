"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { api, errorCode } from "@/lib/api";
import styles from "./Urgent.module.css";

export function UrgentRecovery() {
 const t = useTranslations("urgent");
 const errors = useTranslations("errors");
 const [token, setToken] = useState("");
 const [notice, setNotice] = useState("");
 const [error, setError] = useState("");
 const [busy, setBusy] = useState(false);
 const [purpose, setPurpose] = useState("");
 useEffect(() => {
  if (!token) return;
  let live = true;
  api.post<{ purpose: string }>("/api/client-access/details", { token }).then(
   (result) => { if (live) setPurpose(result.purpose); },
   (exception) => { if (live) setError(errorCode(exception)); },
  );
  return () => { live = false; };
 }, [token]);
 useEffect(() => {
  let live = true;
  const read = () => { if (live) { setToken(window.location.hash.slice(1)); setPurpose(""); setNotice(""); setError(""); } };
  Promise.resolve().then(read);
  window.addEventListener("hashchange", read);
  return () => { live = false; window.removeEventListener("hashchange", read); };
 }, []);
 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault(); setBusy(true); setError("");
  const fields = new FormData(event.currentTarget);
  try {
    await api.post("/api/client-access/redeem", { token, password: fields.get("password") || "" });
    setNotice(t("activationDone"));
  } catch (exception) { setError(errorCode(exception)); } finally { setBusy(false); }
 }
 return <div className={styles.page}><h1>{t("activationTitle")}</h1>
  <form className={styles.card} onSubmit={submit}>
    <p>{t("activationBody")}</p>
    {purpose === "activate" && <label className="field"><span>{t("activationPassword")}</span><input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></label>}
   <button className="button" aria-busy={busy} disabled={busy || Boolean(notice) || !purpose}>{t("activationSubmit")}</button>
   {notice && <p role="status">{notice}</p>}
   {error && <p role="alert" className={styles.error}>{errors(error)}</p>}
  </form>
 </div>;
}
