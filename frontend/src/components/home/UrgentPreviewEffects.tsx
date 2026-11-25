"use client";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Check, CheckCheck, Download, FileImage, MapPin, Mic, MousePointer2, Phone, QrCode, Video } from "lucide-react";
import styles from "./UrgentPreviewEffects.module.css";

export function MeetingPreview({ mode }: { mode: "online" | "inPerson" }) {
 const t=useTranslations("urgentHow");
 return <div className={styles.meeting} data-mode={mode}><div className={styles.choices}><div className={styles.online}><Video size={25}/><span>{t("online")}</span><i/></div><div className={styles.inPerson}><MapPin size={25}/><span>{t("inPerson")}</span><i/></div></div><MousePointer2 className={styles.cursor} size={24} fill="currentColor" strokeWidth={1.4}/></div>;
}

export function PassPreview() {
 const t=useTranslations("urgentHow");
 return <div className={styles.passDemo}>
  <div className={styles.downloadScene}><span className={styles.fileIcon}><FileImage size={38} strokeWidth={1.4}/><Download size={18} className={styles.downloadArrow}/></span><strong>{t("passFile")}</strong><div className={styles.downloadTrack}><i/></div><small><span className={styles.saving}>{t("savingPass")}</span><span className={styles.saved}>{t("openingPass")}</span></small></div>
  <div className={styles.passWindow}><div className={styles.ticket}><div className={styles.ticketHeader}><strong>{t("passBrand")}</strong><small>{t("bookingPass")}</small></div><div className={styles.ticketBody}><QrCode size={68} strokeWidth={1.4}/><div><small>{t("yourCode")}</small><strong>{t("sampleCode")}</strong><span>{t("sampleName")}</span></div></div><dl className={styles.ticketMeta}><div><dt>{t("passLocation")}</dt><dd>{t("sampleLocation")}</dd></div><div><dt>{t("passDate")}</dt><dd>{t("sampleDate")}</dd></div><div><dt>{t("passTime")}</dt><dd>{t("sampleTime")}</dd></div></dl><div className={styles.ticketStub}><MapPin size={12}/><span>{t("passSession")}</span></div><p className={styles.ticketNote}>{t("passAdmit")}</p></div></div>
 </div>;
}

export function ScanPreview() {
 const t=useTranslations("urgentHow");
 return <div className={styles.scanDemo}><div className={styles.scanFrame}><QrCode className={styles.scanQr} size={96} strokeWidth={1.3}/><svg className={styles.scanCorners} viewBox="0 0 140 140" fill="none"><path d="M30 3H15Q3 3 3 15V30M110 3H125Q137 3 137 15V30M137 110V125Q137 137 125 137H110M30 137H15Q3 137 3 125V110" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg><i className={styles.scanWash}/><i className={styles.scanBeam}/><span className={styles.scanSuccess}><Check size={25} strokeWidth={2.5}/></span></div><p><span className={styles.scanning}>{t("scanningPass")}</span><span className={styles.verified}>{t("passChecked")}</span><span className={styles.scanStatic}>{t("readyToScan")}</span></p></div>;
}

export function WhatsAppPreview() {
 const t=useTranslations("urgentHow");const message=t("bookingCodeMessage",{code:t("sampleCode")});
 return <div className={styles.chatDemo}><div className={styles.chatHeader}><Image className={styles.chatAvatar} src="/brand/attentive-signin-mark.png" alt="" width={30} height={30}/><div className={styles.chatHeaderInfo}><strong>{t("chatBrand")}</strong><span className={styles.chatOnline}><i/>{t("chatOnline")}</span></div></div><div className={styles.chatBody}><div className={styles.outgoing}><p>{message}</p><CheckCheck size={13}/></div><div className={styles.replyArea}><div className={styles.adminTyping}><span>{t("chatTyping")}</span><i/><i/><i/></div><div className={styles.incoming}>{t("adminReply")}</div></div></div><div className={styles.chatComposer}><div className={styles.composerField}><span className={styles.composerDraft}>{message}</span></div><i><svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 3 22 12 3 21 6 13 15 12 6 11Z"/></svg></i></div></div>;
}

export function OnlineMeetingPreview() {
 const t=useTranslations("urgentHow");
 return <div className={styles.meetDemo}><div className={styles.meetHeader}><svg viewBox="0 0 28 24" width="24" height="22" aria-hidden="true"><path fill="#00832d" d="M18 7L27 2V22L18 17Z"/><path fill="#00ac47" d="M6 2H18V22H6Z"/><path fill="#2684fc" d="M1 7H7V22H1Z"/><path fill="#ffba00" d="M1 7L7 2V8H1Z"/><path fill="#ea4335" d="M18 7L22 4V20L18 17Z"/></svg><span>{t("meetBrand")}</span></div><div className={styles.videoTile}><span className={styles.meetAvatar}>{t("sampleInitials")}</span><small>{t("sampleName")}</small><div className={styles.meetControls}><Mic size={13}/><Video size={14}/><Phone size={13}/></div></div><strong>{t("meetTitle")}</strong><p>{t("meetHint")}</p><div className={styles.meetJoin}><Video size={15}/>{t("meetJoin")}</div><small className={styles.meetStatus}><span className={styles.meetWaiting}>{t("meetReady")}</span><span className={styles.meetLive}>{t("meetConnected")}</span></small></div>;
}
