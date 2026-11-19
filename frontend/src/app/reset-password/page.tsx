import { getTranslations } from "next-intl/server";
import { ResetForm } from "@/components/auth/AuthForms";
import styles from "../page.module.css";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const t = await getTranslations("auth");
  const { token = "" } = await searchParams;
  return (
    <div className={styles.narrow}>
      <h1>{t("resetTitle")}</h1>
      <ResetForm token={token} />
    </div>
  );
}
