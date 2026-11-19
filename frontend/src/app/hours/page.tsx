import { getTranslations } from "next-intl/server";
import { RequireRole } from "@/components/shell/RequireRole";
import { HoursEditor } from "@/components/staff/HoursEditor";
import styles from "../page.module.css";

export default async function Page() {
  const t = await getTranslations("psy");
  return (
    <div className={styles.wide}>
      <h1>{t("hoursTitle")}</h1>
      <RequireRole role="psychologist">
        <HoursEditor base="/api/psy" />
      </RequireRole>
    </div>
  );
}
