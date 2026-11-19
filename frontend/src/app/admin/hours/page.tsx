import { getTranslations } from "next-intl/server";
import { AdminHours } from "@/components/admin/AdminHours";
import { RequireRole } from "@/components/shell/RequireRole";
import styles from "../../page.module.css";

export default async function Page() {
  const t = await getTranslations("psy");
  return (
    <div className={styles.wide}>
      <h1>{t("hoursTitle")}</h1>
      <RequireRole role="admin">
        <AdminHours />
      </RequireRole>
    </div>
  );
}
