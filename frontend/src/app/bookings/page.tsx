import { getTranslations } from "next-intl/server";
import { MyBookings } from "@/components/bookings/MyBookings";
import { RequireRole } from "@/components/shell/RequireRole";
import styles from "../page.module.css";

export default async function Page({ searchParams }: { searchParams: Promise<{ attend?: string }> }) {
  const t = await getTranslations("bookings");
  const { attend } = await searchParams;
  return (
    <div className={styles.wide}>
      <h1>{t("title")}</h1>
      <RequireRole role="client">
        <MyBookings attendCode={attend} />
      </RequireRole>
    </div>
  );
}
