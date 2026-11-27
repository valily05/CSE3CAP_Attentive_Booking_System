"use client";
import Link from "next/link";
import {useTranslations} from "next-intl";
import {Bot,CalendarDays,Siren,ChartNoAxesCombined,ArrowUpRight,Info} from "lucide-react";
import {useAdminBranch,adminHref} from "./AdminBranch";
import styles from "./AdminPortal.module.css";
export function AdminAssistant(){const t=useTranslations("adminPortal"),branch=useAdminBranch();return <div className={styles.stack}><header className={styles.pageHeading}><div><p className={styles.eyebrow}>{t("system")}</p><h1>{t("chatbot")}</h1><p>{t("assistantBody")}</p></div></header><section className={styles.assistant}><span><Bot size={36}/></span><h2>{t("assistantTitle")}</h2><p>{t("assistantDescription")}</p><div className={styles.notice}><Info size={18}/><p>{t("assistantNotice")}</p></div><div className={styles.assistantLinks}>{[{label:"schedules",href:"/admin/schedules",Icon:CalendarDays},{label:"urgent",href:"/admin/urgent-requests",Icon:Siren},{label:"reports",href:"/admin/reports",Icon:ChartNoAxesCombined}].map(({label,href,Icon})=><Link key={label} href={adminHref(href,branch)}><Icon size={19}/>{t(label)}<ArrowUpRight size={16}/></Link>)}</div></section></div>}
