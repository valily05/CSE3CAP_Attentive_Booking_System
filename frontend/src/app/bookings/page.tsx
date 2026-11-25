import Link from "next/link";
import {CalendarPlus,ArrowUpRight} from "lucide-react";
import { getTranslations } from "next-intl/server";
import {WaitingListManagement} from "@/components/booking/WaitingList";
import { MyBookings } from "@/components/bookings/MyBookings";
import { MyUrgentRequests } from "@/components/urgent/MyUrgentRequests";
import { RequireRole } from "@/components/shell/RequireRole";
import bookingStyles from "@/components/bookings/MyBookings.module.css";
import styles from "../page.module.css";

export default async function Page({ searchParams }: { searchParams: Promise<{ attend?: string }> }) {
  const t = await getTranslations("bookings");
  const detail=await getTranslations("bookingDetails");

  const { attend } = await searchParams;
  return (
    <div className={styles.wide}>
      <header className={bookingStyles.pageHeading}><div className={bookingStyles.pageHeadingCopy}><p>{detail("eyebrow")}</p><h1>{t("title")}</h1><span>{detail("pageDescription")}</span></div><div className={bookingStyles.pageHeadingAction}><Link href="/#find-support" className="button-quiet"><CalendarPlus size={17}/>{detail("bookSession")}<ArrowUpRight size={16}/></Link></div></header>
      <RequireRole role="client">
        <MyBookings attendCode={attend} />
        <WaitingListManagement/>
        <MyUrgentRequests />
      </RequireRole>
    </div>
  );
}
