import { getTranslations } from "next-intl/server";
import styles from "../page.module.css";

export default async function Page() {
  const t = await getTranslations("privacy");
  return (
    <article className={styles.prose}>
      <h1>{t("title")}</h1>
      <p>{t("p1")}</p>
      <p>{t("p2")}</p>
      <p>{t("p3")}</p>
    </article>
  );
}
