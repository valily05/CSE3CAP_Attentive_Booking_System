"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { HoursEditor } from "@/components/staff/HoursEditor";
import { useDirectory } from "./useDirectory";

/** Admin edits anyone's hours and blocks time (G09-3, G09-9). */
export function AdminHours({initialId=""}:{initialId?:string}) {
  const t = useTranslations("admin");
  const { psychologists } = useDirectory();
  const [id, setId] = useState(initialId);
  return (
    <>
      <label className="field">
        <span>{t("psychologist")}</span>
        <select value={id} onChange={(e) => setId(e.target.value)}>
          <option value="" />
          {psychologists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {id && psychologists.some(p=>p.id===id) && <HoursEditor key={id} base={`/api/admin/psychologists/${id}`} />}
    </>
  );
}
