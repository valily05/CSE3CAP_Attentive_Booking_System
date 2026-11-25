"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type InputHTMLAttributes } from "react";
import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { passwordChecks } from "@/lib/password";
import styles from "./PasswordField.module.css";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; strength?: boolean; hideCompletedRules?: boolean; hideRules?: boolean; hideRequiredMarker?: boolean; labelAction?: ReactNode };
export function PasswordField({ label, strength = false, hideCompletedRules = false, hideRules = false, hideRequiredMarker = false, labelAction, ...props }: Props) {
 const t=useTranslations("auth");const id=useId();const input=useRef<HTMLInputElement>(null);
 const [visible,setVisible]=useState(false);const [internal,setInternal]=useState("");
 const value=props.value===undefined?internal:String(props.value);const checks=passwordChecks(value);
 useEffect(()=>{input.current?.setCustomValidity(strength && value && !checks.valid?t("passwordRulesError"):"");},[strength,value,checks.valid,t]);
 return <div className="field">
  <div className={styles.labelRow}><label htmlFor={id}>{label}{props.required && !hideRequiredMarker && <span className="required-marker" aria-hidden="true"> *</span>}</label>{labelAction}</div>
  <div className={styles.control}>
   <input {...props} ref={input} id={id} aria-label={label} type={visible?"text":"password"} value={value} aria-describedby={strength&&!hideRules?id+"-rules":undefined} onChange={event=>{setInternal(event.target.value);props.onChange?.(event);}} />
   <button type="button" className={styles.toggle} aria-label={t(visible?"hidePassword":"showPassword")} aria-pressed={visible} aria-controls={id} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={19} aria-hidden="true"/>:<Eye size={19} aria-hidden="true"/>}</button>
  </div>
  {strength && !hideRules && <ul id={id+"-rules"} className={styles.rules} aria-live="polite" aria-atomic="true">
   {(!hideCompletedRules || !checks.length) && <li data-met={checks.length}>{checks.length?<Check size={15} aria-hidden="true"/>:<Circle size={13} aria-hidden="true"/>}{t("passwordLengthRule")}</li>}
   {!checks.maximum && <li className={styles.limit}>{t("passwordMaximumRule")}</li>}
  </ul>}
 </div>;
}
