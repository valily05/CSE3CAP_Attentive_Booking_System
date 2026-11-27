import { getTranslations } from "next-intl/server";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { RequireRole } from "@/components/shell/RequireRole";
import styles from "../../page.module.css";

export default async function Page() {
  const portal=await getTranslations("adminPortal");
  const t = await getTranslations("admin");
  return (
    <div className={styles.page}>
      <h1>{t("settingsTitle")}</h1><p>{portal("globalSettingsNote")}</p>
      <RequireRole role="admin">
        <SettingsForm />
      </RequireRole>
    </div>
  );
}
