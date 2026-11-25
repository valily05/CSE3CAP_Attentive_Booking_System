import {getTranslations} from "next-intl/server";
import {MyHistory} from "@/components/bookings/MyHistory";
import styles from "../page.module.css";

export default async function Page(){const t=await getTranslations("nav");return <div className={styles.wide}><h1>{t("myHistory")}</h1><MyHistory/></div>;}
