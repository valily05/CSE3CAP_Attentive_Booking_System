import {getTranslations} from "next-intl/server";
import {AdminCalendar} from "@/components/admin/AdminCalendar";
import styles from "@/components/admin/AdminPortal.module.css";
export default async function Page(){const t=await getTranslations("adminPortal");return <div className={styles.stack}><header className={styles.pageHeading}><div><h1>{t("schedules")}</h1><p>{t("schedulesBody")}</p></div></header><AdminCalendar/></div>}
