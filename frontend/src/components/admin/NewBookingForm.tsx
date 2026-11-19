"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { api, errorCode } from "@/lib/api";
import type { Created } from "@/lib/types";
import { Field } from "@/components/ui/Field";
import { useDirectory } from "./useDirectory";
import styles from "./Admin.module.css";

type ClientHit = { id: string; name: string; phone: string; email: string };

/** Admin books for a client, e.g. someone who still uses WhatsApp (G09-9). */
export function NewBookingForm() {
  const t = useTranslations();
  const { catalog, psychologists } = useDirectory();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [client, setClient] = useState<{ id: string; name: string } | null>(null);
  const [psychId, setPsychId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const id = setTimeout(() => {
      api.get<{ clients: ClientHit[] }>(`/api/admin/clients?q=${encodeURIComponent(query)}`).then((r) => setHits(r.clients), (e) => setError(errorCode(e)));
    }, 200);
    return () => clearTimeout(id);
  }, [query]);

  const psych = psychologists.find((p) => p.id === psychId);
  const services = catalog.services.filter((s) => psych?.serviceIds.includes(s.id));
  const channels = (psych?.sessionTypes ?? []).filter((s) => s !== "in_person");
  const places = psych?.sessionTypes.includes("in_person") ? psych.locationIds : [];

  async function createClient(fs: HTMLFieldSetElement) {
    const get = (n: string) => (fs.querySelector(`[name="${n}"]`) as HTMLInputElement).value;
    try {
      const r = await api.post<{ id: string }>("/api/admin/clients", { name: get("cname"), phone: get("cphone"), email: get("cemail") });
      setClient({ id: r.id, name: get("cname") });
      setError(null);
    } catch (err) {
      setError(errorCode(err));
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!client) return;
    const f = new FormData(e.currentTarget);
    const [mode, x] = String(f.get("how")).split(":");
    const start = `${String(f.get("start"))}:00+07:00`;
    const body =
      mode === "online"
        ? { clientId: client.id, psychologistId: psychId, serviceId: f.get("service"), mode, onlineChannel: x, start }
        : { clientId: client.id, psychologistId: psychId, serviceId: f.get("service"), mode, locationId: x, start };
    try {
      const r = await api.post<Created>("/api/bookings", body);
      setNotice(t("admin.booked", { code: r.code }));
      setError(null);
    } catch (err) {
      setError(errorCode(err));
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <p className={styles.muted}>{t("admin.ruleBreakNote")}</p>
      {client ? (
        <p className={styles.picked}>
          {t("admin.client")}: {client.name}
        </p>
      ) : (
        <>
          <Field label={t("admin.findClient")} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
          {hits.length > 0 && (
            <ul className={styles.hits}>
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" className="button-quiet" onClick={() => setClient({ id: h.id, name: h.name })}>
                    {h.name}, {h.phone}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <fieldset className={styles.newClient}>
            <legend>{t("admin.newClient")}</legend>
            <Field label={t("auth.name")} name="cname" autoComplete="off" />
            <Field label={t("auth.phone")} name="cphone" type="tel" autoComplete="off" />
            <Field label={t("auth.email")} name="cemail" type="email" autoComplete="off" />
            <button type="button" className="button-quiet" onClick={(e) => createClient(e.currentTarget.closest("fieldset")!)}>
              {t("admin.createClient")}
            </button>
          </fieldset>
        </>
      )}

      <label className="field">
        <span>{t("admin.psychologist")}</span>
        <select value={psychId} onChange={(e) => setPsychId(e.target.value)} required>
          <option value="" />
          {psychologists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t("admin.service")}</span>
        <select name="service" required>
          <option value="" />
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t("admin.channel")}</span>
        <select name="how" required>
          <option value="" />
          {channels.map((c) => (
            <option key={c} value={`online:${c}`}>
              {t(`sessionType.${c}`)}
            </option>
          ))}
          {places.map((l) => (
            <option key={l} value={`in_person:${l}`}>
              {catalog.locations.find((x) => x.id === l)?.name ?? l}
            </option>
          ))}
        </select>
      </label>
      <Field label={t("admin.start")} name="start" type="datetime-local" step={900} required />
      <button className="button" disabled={!client}>
        {t("admin.book")}
      </button>
      <p role="status" className={styles.notice}>
        {notice}
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {t(`errors.${error}`)}
        </p>
      )}
    </form>
  );
}
