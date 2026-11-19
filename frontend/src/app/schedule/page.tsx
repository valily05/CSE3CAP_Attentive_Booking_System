import { getTranslations } from "next-intl/server";
import { RequireRole } from "@/components/shell/RequireRole";
import { ScheduleList } from "@/components/staff/ScheduleList";
import styles from "../page.module.css";

export default async function Page() {
  const t = await getTranslations("psy");
  return (
    <div className={styles.page}>
      <h1>{t("scheduleTitle")}</h1>
      <RequireRole role="psychologist">
        <ScheduleList />
      </RequireRole>
    </div>
  );
}
