import { getTranslations } from "next-intl/server";
import { ForgotForm } from "@/components/auth/AuthForms";
import styles from "../page.module.css";

export default async function Page() {
  const t = await getTranslations("auth");
  return (
    <div className={styles.narrow}>
      <h1>{t("forgotTitle")}</h1>
      <ForgotForm />
    </div>
  );
}
