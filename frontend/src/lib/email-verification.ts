import {rememberVerifiedEmail} from "./verified-emails";
export const emailVerificationEvent="attentive:email-verification";
export const emailVerificationStorageKey="attentive.email-verification-notice.v1";
export type EmailVerificationNotice={type:"verified";email:string;at:number}|{type:"error";code:string;at:number};
export function announceEmailVerification(email:string,{local=true}:{local?:boolean}={}){rememberVerifiedEmail(email);const notice:EmailVerificationNotice={type:"verified",email,at:Date.now()};if(local)window.dispatchEvent(new CustomEvent(emailVerificationEvent,{detail:notice}));try{localStorage.setItem(emailVerificationStorageKey,JSON.stringify(notice));localStorage.removeItem(emailVerificationStorageKey)}catch{}}
export function announceEmailVerificationError(code:string){window.dispatchEvent(new CustomEvent(emailVerificationEvent,{detail:{type:"error",code,at:Date.now()} satisfies EmailVerificationNotice}))}
