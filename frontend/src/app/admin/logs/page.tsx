import {getTranslations} from "next-intl/server";
import {History} from "@/components/admin/History";
import styles from "@/components/admin/AdminPortal.module.css";
export default async function Page(){const t=await getTranslations("adminPortal");return <div className={styles.stack}><header className={styles.pageHeading}><div><h1>{t("logs")}</h1><p>{t("logsBody")}</p></div></header><History/></div>}
