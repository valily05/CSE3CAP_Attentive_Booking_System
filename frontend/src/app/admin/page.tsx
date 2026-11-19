import { getTranslations } from "next-intl/server";
import { AdminCalendar } from "@/components/admin/AdminCalendar";
import { RequireRole } from "@/components/shell/RequireRole";
import styles from "../page.module.css";

export default async function Page() {
  const t = await getTranslations("admin");
  return (
    <div className={styles.wide}>
      <h1>{t("calendarTitle")}</h1>
      <RequireRole role="admin">
        <AdminCalendar />
      </RequireRole>
    </div>
  );
}
