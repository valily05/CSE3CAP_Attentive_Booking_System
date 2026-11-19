import { getTranslations } from "next-intl/server";
import { Reports } from "@/components/admin/Reports";
import { RequireRole } from "@/components/shell/RequireRole";
import styles from "../../page.module.css";

export default async function Page() {
  const t = await getTranslations("admin");
  return (
    <div className={styles.page}>
      <h1>{t("reportsTitle")}</h1>
      <RequireRole role="admin">
        <Reports />
      </RequireRole>
    </div>
  );
}
