"use client";
import {CalendarX,ChevronDown} from "lucide-react";
import {errorCode} from "@/lib/api";
import {showToast} from "@/lib/toast";
import {useEffect,useId,useRef,useState} from "react";
import {useTranslations} from "next-intl";
import {useApi} from "@/lib/useApi";
import {addDays,addMonths,daysInMonth,formatDateTime} from "@/lib/time";
import {useAppLocale} from "@/lib/i18n";
import type {Booking,Day,Slot} from "@/lib/types";
import {MonthPicker} from "@/components/booking/MonthPicker";
import styles from "./MyBookings.module.css";
const REASONS=["schedule_conflict","travel","cost","other"] as const;
/** The same month calendar as booking, for the booking's psychologist, service and place. */
export function Reschedule({ booking: b, today, onPick }: { booking: Booking; today: string; onPick: (s: Slot) => Promise<void> | void }) {
  const t=useTranslations("bookings"),locale=useAppLocale();
  const [selected,setSelected]=useState<Slot|null>(null),[saving,setSaving]=useState(false);
  const tomorrow = addDays(today, 1);
  const firstMonth = tomorrow.slice(0, 7);
  const [month, setMonth] = useState(firstMonth);
  const from = month === firstMonth ? tomorrow : `${month}-01`;
  const q = new URLSearchParams({ service: b.serviceId, from, days: String(daysInMonth(month) - Number(from.slice(8)) + 1), mode: b.mode });
  if (b.mode === "in_person" && b.locationId) q.set("location", b.locationId);
  const res = useApi<{ days: Day[] }>(`/api/psychologists/${b.psychologistId}/slots?${q}`);
  return (
    <fieldset className={styles.rescheduleChoices} disabled={saving}><MonthPicker
      key={month}
      month={month}
      days={res.data?.days ?? []}
      today={today}
      selected={selected?.Start??null}
      onSelect={setSelected}
      canGoBack={month > firstMonth}
      onMonth={(d) => {setSelected(null);setMonth(addMonths(month, d))}}
    />
    <div className={styles.rescheduleConfirm}><p aria-live="polite">{selected?t("selectedTime",{time:formatDateTime(selected.Start,locale)}):t("chooseTimeFirst")}</p><button type="button" className="button" disabled={!selected||saving||Date.parse(selected.Start)===Date.parse(b.start)} onClick={async()=>{if(!selected||saving)return;setSaving(true);try{await onPick(selected)}finally{setSaving(false)}}}>{t(saving?"savingChange":"confirmChange")}</button></div></fieldset>
  );
}

export function CancelDialog({onClose,onConfirm}:{onClose:()=>void;onConfirm:(reason:string)=>Promise<void>}){
 const t=useTranslations("bookings"),errors=useTranslations("errors");const title=useId(),dialog=useRef<HTMLDialogElement>(null);const[reason,setReason]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{const el=dialog.current;el?.showModal();return()=>el?.close()},[]);
 return <dialog ref={dialog} aria-labelledby={title} className={styles.confirmDialog} onCancel={onClose}><div className={styles.cancelHeading}><span><CalendarX size={23}/></span><h3 id={title}>{t("cancelTitle")}</h3></div><p>{t("cancelBody")}</p><label className="field"><span>{t("reasonLabel")}</span><span className={styles.cancelSelect}><select value={reason} onChange={e=>setReason(e.target.value)}><option value="">{t("reason.none")}</option>{REASONS.map(r=><option key={r} value={r}>{t(`reason.${r}`)}</option>)}</select><ChevronDown size={17} aria-hidden="true"/></span></label>{error&&<p role="alert" className={styles.error}>{errors(error)}</p>}<div className={styles.actions}><button type="button" className="button-danger" disabled={busy} onClick={async()=>{if(busy)return;setBusy(true);setError("");try{await onConfirm(reason)}catch(e){setError(errorCode(e));showToast(errors(errorCode(e)),true)}finally{setBusy(false)}}}>{t("confirmCancel")}</button><button type="button" className="button-quiet" disabled={busy} onClick={onClose}>{t("keep")}</button></div></dialog>
}
