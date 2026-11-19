import { getTranslations } from "next-intl/server";
import { NewBookingForm } from "@/components/admin/NewBookingForm";
import { RequireRole } from "@/components/shell/RequireRole";
import styles from "../../page.module.css";

export default async function Page() {
  const t = await getTranslations("admin");
  return (
    <div className={styles.page}>
      <h1>{t("newBookingTitle")}</h1>
      <RequireRole role="admin">
        <NewBookingForm />
      </RequireRole>
    </div>
  );
}
