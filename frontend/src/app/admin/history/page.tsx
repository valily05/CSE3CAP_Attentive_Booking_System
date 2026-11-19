import { getTranslations } from "next-intl/server";
import { History } from "@/components/admin/History";
import { RequireRole } from "@/components/shell/RequireRole";
import styles from "../../page.module.css";

export default async function Page() {
  const t = await getTranslations("admin");
  return (
    <div className={styles.page}>
      <h1>{t("historyTitle")}</h1>
      <RequireRole role="admin">
        <History />
      </RequireRole>
    </div>
  );
}
