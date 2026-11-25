import Link from "next/link";
import {ArrowUpRight} from "lucide-react";
import historyStyles from "@/components/bookings/MyHistory.module.css";
import {getTranslations} from "next-intl/server";
import {MyHistory} from "@/components/bookings/MyHistory";
import bookingStyles from "@/components/bookings/MyBookings.module.css";
import styles from "../page.module.css";
export default async function Page(){const t=await getTranslations();return <div className={styles.wide}><header className={bookingStyles.pageHeading}><div className={bookingStyles.pageHeadingCopy}><p>{t("bookingDetails.eyebrow")}</p><h1>{t("nav.myHistory")}</h1><span>{t("history.pageIntro")}</span></div><div className={bookingStyles.pageHeadingAction}><Link href="/bookings" className={"button-quiet "+historyStyles.bookingsLink}>{t("nav.myBookings")}<ArrowUpRight size={17} aria-hidden="true"/></Link></div></header><MyHistory/></div>;}
