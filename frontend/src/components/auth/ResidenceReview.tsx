"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useTranslations} from "next-intl";
import {api,errorCode} from "@/lib/api";
import {readRegistrationRecovery,clearRegistrationRecovery,type ResidenceDetails} from "@/lib/registration-recovery";
import {residenceCountries,residenceCities,zoneLabel} from "@/lib/residence";
import {AccountMenu} from "./AccountMenu";
import styles from "./AuthForms.module.css";
type StoredResidence=ResidenceDetails&{email:string};
export function ResidenceReview(){
 const t=useTranslations("auth"),errors=useTranslations("errors");const[current,setCurrent]=useState<StoredResidence|null>(null),[value,setValue]=useState<ResidenceDetails|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
 useEffect(()=>{let live=true;api.get<StoredResidence>("/api/me/residence").then(data=>{if(!live)return;setCurrent(data);const draft=readRegistrationRecovery();setValue(draft?.email===data.email.toLowerCase()&&draft.residence?draft.residence:data)},cause=>{if(live)setError(errorCode(cause))});return()=>{live=false}},[]);
 if(!value||!current)return <div data-residence-review><p role={error?"alert":undefined}>{error?errors(error):t("residenceLoading")}</p>{error==="unauthenticated"&&<Link className="button" href="/signin?next=/account/residence">{t("continueToLogin")}</Link>}</div>;
 if(saved)return <div data-residence-review className={styles.verification}><h2>{t("residenceSaved")}</h2><p>{t("residenceSavedBody")}</p><Link className="button" href="/bookings">{t("viewBookings")}</Link></div>;
 const valid=Boolean(value.country&&value.city.trim()&&value.timeZone&&(value.country!=="OTHER"||value.otherCountry.trim().length>=2));const menuLabels={searchLabel:t("searchOptions"),noResults:t("noMatchingOptions")};
 return <form data-residence-review className={styles.form} onSubmit={async event=>{event.preventDefault();if(!valid||busy)return;setBusy(true);setError(null);try{await api.put("/api/me/residence",{country:value.country,otherCountry:value.country==="OTHER"?value.otherCountry:"",city:value.city.trim(),timeZone:value.timeZone});clearRegistrationRecovery(current.email);setSaved(true)}catch(cause){setError(errorCode(cause))}finally{setBusy(false)}}}>
 <p className={styles.formHelp}>{t("residenceCurrent",{country:t(`countries.${current.country}`),city:current.city})}</p>
 <AccountMenu label={t("residenceCountry")} value={value.country} required options={residenceCountries.map(code=>({value:code,label:t(`countries.${code}`),flag:code==="OTHER"?undefined:code}))} {...menuLabels} onChange={country=>setValue({...value,country,otherCountry:"",city:"",timeZone:""})}/>
 {value.country==="OTHER"&&<label className="field"><span>{t("otherCountryName")}</span><input required minLength={2} maxLength={100} placeholder={t("countryPlaceholder")} value={value.otherCountry} onChange={e=>setValue({...value,otherCountry:e.target.value})}/></label>}
 <AccountMenu label={t("residenceCity")} value={value.country==="OTHER"?value.timeZone:value.city} required disabled={!value.country} placeholder={t("chooseCity")} options={value.country==="OTHER"?["UTC",...Intl.supportedValuesOf("timeZone")].map(zone=>({value:zone,label:zoneLabel(zone)})):Object.entries(residenceCities[value.country]||{}).map(([city,zone])=>({value:city,label:zoneLabel(zone,city)}))} {...menuLabels} onChange={choice=>setValue({...value,city:value.country==="OTHER"?choice.split('/').at(-1)?.replaceAll('_',' ')||choice:choice,timeZone:value.country==="OTHER"?choice:residenceCities[value.country]?.[choice]||""})}/>
 {error&&<p role="alert" className={styles.error}>{errors(error)}</p>}<button className="button" disabled={!valid||busy} aria-busy={busy}>{t(busy?"residenceSaving":"residenceSave")}</button><Link href="/bookings" onClick={()=>clearRegistrationRecovery(current.email)}>{t("residenceSkip")}</Link>
 </form>;
}
