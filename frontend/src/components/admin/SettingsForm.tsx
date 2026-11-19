"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, errorCode } from "@/lib/api";
import { Field } from "@/components/ui/Field";
import styles from "./Admin.module.css";

type Settings = {
  minLeadMinutes: number;
  changeCutoffMinute: number;
  breakMinutes: number;
  reminderFirstMinutes: number;
  reminderSecondMinutes: number;
  followUpDays: number;
  followUpCooldownDays: number;
};
const NUMBERS: (keyof Settings)[] = ["minLeadMinutes", "changeCutoffMinute", "breakMinutes", "reminderFirstMinutes", "reminderSecondMinutes", "followUpCooldownDays"];

/** The admin's "starting numbers" (G09-9 settings page). */
export function SettingsForm() {
  const t = useTranslations("admin");
  const te = useTranslations("errors");
  const [s, setS] = useState<Settings | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Settings>("/api/admin/settings").then(setS, (e) => setError(errorCode(e)));
  }, []);

  if (!s) return error ? <p role="alert">{te(error)}</p> : null;

  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api.put("/api/admin/settings", s);
          setNotice(t("settingsSaved"));
          setError(null);
        } catch (err) {
          setNotice(null);
          setError(errorCode(err));
        }
      }}
    >
      <p className={styles.muted}>{t("settingsBody")}</p>
      {NUMBERS.map((k) => (
        <Field key={k} label={t(k)} type="number" min={0} value={s[k]} required onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} />
      ))}
      <label className="field">
        <span>{t("followUpDays")}</span>
        <select value={s.followUpDays} onChange={(e) => setS({ ...s, followUpDays: Number(e.target.value) })}>
          {[30, 60, 90].map((d) => (
            <option key={d} value={d}>
              {t("days", { days: d })}
            </option>
          ))}
        </select>
      </label>
      <button className="button">{t("saveSettings")}</button>
      <p role="status" className={styles.notice}>
        {notice}
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {te(error)}
        </p>
      )}
    </form>
  );
}
