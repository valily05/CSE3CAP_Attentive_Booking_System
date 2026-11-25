"use client";

import {clientPageEvent,takeVerificationReturnView,takeVerificationReturnAddress} from "@/lib/verification-return";
import {useEmailVerified} from "./useEmailVerified";
import {forgetVerifiedEmail} from "@/lib/verified-emails";
import {ForwardArrow} from "@/components/ui/ForwardArrow";
import Link from "next/link";
import {LoaderCircle, MailCheck, Check} from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { api, errorCode } from "@/lib/api";
import { useAppLocale } from "@/lib/i18n";
import type { Me, Role } from "@/lib/types";
import { Field } from "@/components/ui/Field";
import styles from "./AuthForms.module.css";
import {emailVerificationEvent,emailVerificationStorageKey,type EmailVerificationNotice} from "@/lib/email-verification";
import {AccountMenu} from "./AccountMenu";
import {saveRegistrationRecovery,readRegistrationRecovery,recoveryLoginHref} from "@/lib/registration-recovery";
import {getCountries,getCountryCallingCode,parsePhoneNumberFromString,type CountryCode} from "libphonenumber-js";
import { PasswordField } from "@/components/ui/PasswordField";
import { passwordChecks } from "@/lib/password";
import { residenceCountries, residenceCities, zoneLabel } from "@/lib/residence";

/** Where a role lands after signing in. `next` is followed only if it is a local path. */
export function homeFor(role: Role, next?: string | null): string {
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  switch (role) {
    case "admin":
      return safe ?? "/admin";
    case "psychologist":
      return safe ?? "/schedule";
    default:
      return safe ?? "/bookings";
  }
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorCode(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

function ErrorLine({ code }: { code: string | null }) {
  const t = useTranslations("errors");
  return code ? (
    <p role="alert" className={styles.error}>
      {t(code)}
    </p>
  ) : null;
}

function RegistrationVerification({email}:{email:string}) {
 const t=useTranslations("auth");const verified=useEmailVerified(email);
 useEffect(()=>{window.dispatchEvent(new Event(clientPageEvent))},[email]);
 return <div data-registration-verification data-verification-email={email} className={styles.verification}>
  <div className={styles.envelope} aria-hidden="true"><span/><MailCheck size={62} strokeWidth={1.3}/><i><Check size={18} strokeWidth={2.5}/></i></div>
  <h2>{t("verificationTitle")}</h2><p>{t("verificationIntro")}</p><strong className={styles.verificationEmail}>{email}</strong><p className={styles.verificationNote}>{t("verificationNext")}</p>
  <div className={styles.verificationActions}>{verified?<button type="button" disabled className={"button-quiet "+styles.resendLink}>{t("resendVerification")}</button>:<Link className={"button-quiet "+styles.resendLink} href="/resend-verification">{t("resendVerification")}</Link>}<Link className="button" href="/signin">{t("continueToLogin")}<ForwardArrow/></Link></div>
 </div>;
}

export function SignUpForm() {
  const t = useTranslations("auth");
  const locale = useAppLocale();
  const { busy, error, run, setError } = useSubmit();
  const [sentTo, setSentTo] = useState<string | null>(null);
  useEffect(()=>{const email=takeVerificationReturnView();if(email)setSentTo(email)},[]);
  const [values, setValues] = useState({name:"",email:"",phone:"",password:"",privacy:false});
  const validationId=useId();
  const [emailTouched,setEmailTouched]=useState(false),[phoneTouched,setPhoneTouched]=useState(false);
  const [country,setCountry]=useState("");
  const [city,setCity]=useState("");
  const [zone,setZone]=useState("");
  const [otherCountry,setOtherCountry]=useState("");
  const [otherZones,setOtherZones]=useState<string[]>([]);
  useEffect(()=>{if(error!=="account_unverified")return;const accept=(notice:EmailVerificationNotice)=>{if(notice.type==='verified'&&notice.email.trim().toLowerCase()===values.email.trim().toLowerCase())setError(null)};const local=(e:Event)=>accept((e as CustomEvent<EmailVerificationNotice>).detail);const shared=(e:StorageEvent)=>{if(e.key!==emailVerificationStorageKey||!e.newValue)return;try{accept(JSON.parse(e.newValue))}catch{}};window.addEventListener(emailVerificationEvent,local);window.addEventListener('storage',shared);return()=>{window.removeEventListener(emailVerificationEvent,local);window.removeEventListener('storage',shared)}},[error,values.email,setError]);
  const phone=values.phone.replace(/[\s()-]/g,"");
  const [phoneCountry,setPhoneCountry]=useState<CountryCode>("ID");
  const parsedPhone=parsePhoneNumberFromString(phone,phoneCountry);
  const normalizedPhone=parsedPhone?.number||"";
  const phoneValid=Boolean(parsedPhone?.isPossible());
  const regionNames=new Intl.DisplayNames([locale],{type:"region"});
  const phoneOptions=getCountries().map(code=>({value:code,label:regionNames.of(code)||code,flag:code,detail:"+"+getCountryCallingCode(code)})).sort((a,b)=>a.label.localeCompare(b.label,locale));
  const menuLabels={searchLabel:t("searchOptions"),noResults:t("noMatchingOptions")};
  const emailValid=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()) && !values.email.includes("..") && !values.email.trim().startsWith(".") && !values.email.includes(".@");
  const missingRequirements=[!values.name.trim()?t("name"):null,!phoneValid?t("phone"):null,!passwordChecks(values.password).valid?t("password"):null,!country?t("residenceCountry"):null,!city.trim()||!zone?t("residenceCity"):null,country==="OTHER"&&otherCountry.trim().length<2?t("otherCountryName"):null,!values.privacy?t("privacyRequirement"):null].filter(Boolean);
  const showEmailError=!emailValid&&(emailTouched||values.email.length>0||missingRequirements.length===0);
  const valid=Boolean(values.name.trim() && emailValid && phoneValid && passwordChecks(values.password).valid && values.privacy && country && city.trim() && zone && (country!=="OTHER" || otherCountry.trim().length>=2));

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid || busy || !e.currentTarget.checkValidity()) return;
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email")).trim();
    void run(async () => {
      try { await api.post("/api/auth/signup", {
        name: f.get("name"),
        email,
        phone: normalizedPhone,
        password: f.get("password"),
        agreedPrivacy: f.get("privacy") === "on",
        checkInConsent: f.get("checkIn") === "on",
        locale,
        country,city:city.trim(),timeZone:zone,otherCountry:country==="OTHER"?otherCountry.trim():"",
      });
      } catch(cause) { if(["account_unverified","email_delivery_failed"].includes(errorCode(cause)))forgetVerifiedEmail(email);if(["account_unverified","email_taken"].includes(errorCode(cause))) saveRegistrationRecovery(email,{country,otherCountry:country==="OTHER"?otherCountry.trim():"",city:city.trim(),timeZone:zone}); else if(errorCode(cause)==="email_delivery_failed") saveRegistrationRecovery(email);throw cause; }
      forgetVerifiedEmail(email);
      saveRegistrationRecovery(email);
      setSentTo(email);
    });
  }

  if (sentTo) return <RegistrationVerification email={sentTo} />;

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className="field">
        <span>{t("name")} <span className="required-marker" aria-hidden="true">*</span></span>
        <input name="name" aria-label={t("name")} autoComplete="name" placeholder={t("namePlaceholder")} required value={values.name} onChange={e=>setValues({...values,name:e.target.value})} maxLength={160} />
      </label>
      <label className="field">
        <span>{t("email")} <span className="required-marker" aria-hidden="true">*</span></span>
        <input name="email" aria-label={t("email")} type="email" autoComplete="email" placeholder="you@example.com" required value={values.email} aria-invalid={showEmailError} aria-describedby={showEmailError?validationId+"-email":undefined} onBlur={()=>setEmailTouched(true)} onChange={e=>setValues({...values,email:e.target.value})} />
        {showEmailError&&<small id={validationId+"-email"} className={styles.fieldError}>{t("emailFormatHint")}</small>}
      </label>
      <PasswordField label={t("password")} name="password" autoComplete="new-password" placeholder={t("newPasswordPlaceholder")} required strength value={values.password} onChange={e=>setValues({...values,password:e.target.value})} />
      <div className="field"><label htmlFor="signup-phone">{t("phone")} <span className="required-marker" aria-hidden="true">*</span></label><div className={styles.phoneControl}><AccountMenu compact label={t("phoneCountry")} value={phoneCountry} options={phoneOptions} {...menuLabels} onChange={value=>setPhoneCountry(value as CountryCode)}/><input id="signup-phone" aria-invalid={phoneTouched&&!phoneValid} aria-describedby={phoneTouched&&!phoneValid?validationId+"-phone":undefined} onBlur={()=>setPhoneTouched(true)} aria-label={t("phone")} name="phone" type="tel" autoComplete="tel-national" inputMode="tel" placeholder="812 3456 7890" required value={values.phone} onChange={e=>{const value=e.target.value;if(value.trim().startsWith("+")){const parsed=parsePhoneNumberFromString(value);if(parsed?.country)setPhoneCountry(parsed.country);}setValues({...values,phone:value});}}/></div>{phoneTouched&&!phoneValid&&<small id={validationId+"-phone"} className={styles.fieldError}>{t("phoneFormatHint")}</small>}</div>
      <AccountMenu label={t("residenceCountry")} required value={country} placeholder={t("chooseCountry")} options={residenceCountries.map(code=>({value:code,label:t(`countries.${code}`),flag:code==="OTHER"?undefined:code}))} {...menuLabels} onChange={selected=>{setCountry(selected);setCity("");setOtherCountry("");setZone("");if(selected==="OTHER")setOtherZones(["UTC",...Intl.supportedValuesOf("timeZone")]);}}/>
      {country==="OTHER" && <Field label={t("otherCountryName")} name="otherCountry" autoComplete="country-name" placeholder={t("countryPlaceholder")} required maxLength={100} value={otherCountry} onChange={e=>setOtherCountry(e.target.value)} />}
      <div className="field"><AccountMenu label={t("residenceCity")} required disabled={!country} value={country==="OTHER"?zone:city} placeholder={t("chooseCity")} options={country==="OTHER"?otherZones.map(value=>({value,label:zoneLabel(value)})):Object.entries(residenceCities[country]||{}).map(([name,value])=>({value:name,label:zoneLabel(value,name)}))} {...menuLabels} onChange={value=>{if(country==="OTHER"){setZone(value);setCity(value.split("/").at(-1)?.replaceAll("_"," ")||value);}else{setCity(value);setZone(residenceCities[country]?.[value]||"");}}}/></div>
      <label className={styles.check}>
        <input type="checkbox" name="privacy" required checked={values.privacy} onChange={e=>setValues({...values,privacy:e.target.checked})} />
        <span>{t.rich("privacy", { link: (c) => <Link href="/privacy">{c}</Link> })} <span className="required-marker" aria-hidden="true">*</span></span>
      </label>
      <label className={styles.check}>
        <input type="checkbox" name="checkIn" aria-describedby="checkin-hint" />
        <span>
          {t("checkIn")}
          <small id="checkin-hint">{t("checkInHint")}</small>
        </span>
      </label>
      <ErrorLine code={error} />
      {["email_delivery_failed","account_unverified"].includes(error||"") && <Link className={styles.registrationResend} href="/resend-verification">{t("resendVerification")}</Link>}
      {!valid&&missingRequirements.length>0&&<p id={validationId+"-requirements"} className={styles.formHelp} aria-live="polite">{t("completeRequirements",{fields:missingRequirements.join(", ")})}</p>}
      {error==="email_taken"&&<Link className={styles.registrationResend} href="/forgot">{t("forgot")}</Link>}
      <button className="button" disabled={busy || !valid} aria-busy={busy} aria-describedby={!valid?(missingRequirements.length?validationId+"-requirements":showEmailError?validationId+"-email":undefined):undefined}>
        {busy?<LoaderCircle className={styles.signInSpinner} size={16} aria-hidden="true"/>:null}{t(busy?"creatingAccount":"submitSignUp")}
      </button>
      <p className={styles.alt}>{t.rich("haveAccount", { link: (c) => <Link href={["account_unverified","email_taken"].includes(error||"")?"/signin?next=/account/residence":"/signin"}>{c}</Link> })}</p>
    </form>
  );
}

export function SignInForm({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const t = useTranslations("auth");
  const { busy, error, run } = useSubmit();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if(busy)return;
    const f = new FormData(e.currentTarget);
    void run(async () => onSignedIn(await api.post<Me>("/api/auth/login", { email: f.get("email"), password: f.get("password") })));
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className="field">
        <span>{t("email")}</span>
        <input name="email" type="email" autoComplete="email" placeholder={t("signInEmailPlaceholder")} required />
      </label>
      <PasswordField label={t("password")} name="password" autoComplete="current-password" placeholder={t("signInPasswordPlaceholder")} required hideRequiredMarker />
      <ErrorLine code={error} />
      <p className={styles.alt}><Link href="/forgot">{t("forgot")}</Link></p>
      <button className="button" disabled={busy} aria-busy={busy}>
        {busy&&<LoaderCircle size={16} className={styles.signInSpinner} aria-hidden="true"/>}{t(busy?"signingIn":"submitSignIn")}
      </button>
      {error === "email_not_verified" && <Link href="/resend-verification">{t("resendVerification")}</Link>}
      
      <p className={styles.alt}>{t.rich("noAccount", { link: (c) => <Link href="/signup">{c}</Link> })}</p>
    </form>
  );
}

export function ResendVerificationForm({verificationPending=false,verifiedAddress=""}:{verificationPending?:boolean;verifiedAddress?:string}={}) {
 const t=useTranslations("auth"),locale=useAppLocale();const{busy,error,run}=useSubmit();const[email,setEmail]=useState("");const[remaining,setRemaining]=useState(0),[sent,setSent]=useState(false),[hasDraft,setHasDraft]=useState(false);
 useEffect(()=>{const saved=readRegistrationRecovery();if(saved){setEmail(saved.email);setHasDraft(Boolean(saved.residence))}},[]);
 useEffect(()=>{if(!remaining)return;const timer=setTimeout(()=>setRemaining(value=>Math.max(0,value-1)),1000);return()=>clearTimeout(timer)},[remaining]);
 const[verifiedEmail,setVerifiedEmail]=useState("");
 useEffect(()=>{const address=takeVerificationReturnAddress();if(address){setEmail(address);setVerifiedEmail(address);const saved=readRegistrationRecovery();setHasDraft(Boolean(saved?.email===address.toLowerCase()&&saved.residence))}},[]);
 useEffect(()=>{if(verifiedAddress){setVerifiedEmail(verifiedAddress);setEmail(verifiedAddress);setSent(false)}},[verifiedAddress]);
 useEffect(()=>{const accept=(notice:EmailVerificationNotice)=>{if(notice.type==='verified')setVerifiedEmail(notice.email)};const onNotice=(e:Event)=>accept((e as CustomEvent<EmailVerificationNotice>).detail);const onStorage=(e:StorageEvent)=>{if(e.key!==emailVerificationStorageKey||!e.newValue)return;try{const item=JSON.parse(e.newValue);if(item.type==='verified'&&typeof item.email==='string')accept(item)}catch{}};window.addEventListener(emailVerificationEvent,onNotice);window.addEventListener('storage',onStorage);return()=>{window.removeEventListener(emailVerificationEvent,onNotice);window.removeEventListener('storage',onStorage)}},[]);
 const storedVerified=useEmailVerified(email);
 const emailVerified=storedVerified||Boolean(verifiedEmail&&verifiedEmail.toLowerCase()===email.trim().toLowerCase());
 const valid=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
 return <form data-resend-page className={styles.form} onSubmit={event=>{event.preventDefault();if(!valid||busy||remaining||verificationPending||emailVerified)return;void run(async()=>{await api.post("/api/auth/resend-verification",{email:email.trim(),locale});const saved=readRegistrationRecovery();if(saved?.email!==email.trim().toLowerCase()){saveRegistrationRecovery(email);setHasDraft(false)}setSent(true);setRemaining(60)})}}>
 <p>{t("resendVerificationBody")}</p><label className="field"><span>{t("email")}</span><input aria-label={t("email")} name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} disabled={verificationPending} aria-invalid={Boolean(email&&!valid)} aria-describedby={email&&!valid?"resend-email-error":undefined} onChange={event=>{setEmail(event.target.value);setSent(false);setHasDraft(Boolean(readRegistrationRecovery()?.residence&&readRegistrationRecovery()?.email===event.target.value.trim().toLowerCase()))}} required/></label>
 {email&&!valid&&<small id="resend-email-error" className={styles.fieldError}>{t("emailFormatHint")}</small>}
 <ErrorLine code={error}/>{sent&&<p role="status" className={styles.formHelp}>{t("verificationResent")}</p>}
 <button className="button-quiet" disabled={busy||!valid||remaining>0||verificationPending||emailVerified} aria-busy={busy||verificationPending}>{busy?<LoaderCircle className={styles.signInSpinner} size={16} aria-hidden="true"/>:null}{verificationPending?t("verifying"):remaining?t("verificationResendIn",{seconds:remaining}):t("resendVerification")}</button>
 <Link className={"button "+styles.resendContinue} href={hasDraft?"/signin?next=/account/residence":"/signin"}><span>{t("continueToLogin")}</span><ForwardArrow/></Link>
 </form>;
}

export function ForgotForm() {
  const t = useTranslations("auth");
  const locale = useAppLocale();
  const { busy, error, run } = useSubmit();
  const [sent, setSent] = useState(false);
  if (sent) return <p className={styles.done}>{t("linkSent")}</p>;
  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        const email = new FormData(e.currentTarget).get("email");
        void run(async () => {
          await api.post("/api/auth/forgot", { email, locale });
          setSent(true);
        });
      }}
    >
      <p>{t("forgotBody")}</p>
      <label className="field">
        <span>{t("email")}</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <ErrorLine code={error} />
      <button className="button" disabled={busy}>
        {t("sendLink")}
      </button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const { busy, error, run } = useSubmit();
  const [saved, setSaved] = useState(false);
  if (saved)
    return (
      <p className={styles.done}>
        {t("passwordSaved")} <Link href="/signin">{t("submitSignIn")}</Link>
      </p>
    );
  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        const password = new FormData(e.currentTarget).get("password");
        void run(async () => {
          await api.post("/api/auth/reset", { token, password });
          setSaved(true);
        });
      }}
    >
      <PasswordField label={t("newPassword")} name="password" autoComplete="new-password" strength required />
      <ErrorLine code={error} />
      <button className="button" disabled={busy}>
        {t("savePassword")}
      </button>
    </form>
  );
}

/** Confirms an email or unsubscribes from a link, as soon as the page opens. */
export function TokenAction({ path, token, pending, success }: { path: string; token: string; pending: string; success: string }) {
  const t = useTranslations();
  const [state, setState] = useState<"pending" | "ok" | string>("pending");
  const [started, setStarted] = useState(false);
  if (!started) {
    setStarted(true);
    api.post(path, { token }).then(
      () => setState("ok"),
      (e) => setState(errorCode(e)),
    );
  }
  if (state === "pending") return <p>{t(pending)}</p>;
  if (state === "ok") return <div><p className={styles.done}>{t(success)}</p>{path==="/api/auth/verify"&&<Link className="button" href={recoveryLoginHref()}>{t("auth.continueToLogin")} <ForwardArrow/></Link>}</div>;
  return (
    <p role="alert" className={styles.error}>
      {t(`errors.${state}`)}
    </p>
  );
}
