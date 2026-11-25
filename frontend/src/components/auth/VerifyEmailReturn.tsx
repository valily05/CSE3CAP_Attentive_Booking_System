"use client";
import {useEffect,useRef} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {api,errorCode} from "@/lib/api";
import {announceEmailVerification,announceEmailVerificationError} from "@/lib/email-verification";
import {readLastClientPage,prepareVerificationReturn,type ClientPage} from "@/lib/verification-return";
export function VerifyEmailReturn({token}:{token:string}){
 const router=useRouter(),t=useTranslations('auth');const request=useRef<{token:string;promise:Promise<{email:string}>}|null>(null);
 useEffect(()=>{let active=true;if(!token){router.replace(readLastClientPage()?.path||'/signin');return}if(request.current?.token!==token)request.current={token,promise:api.post<{email:string}>('/api/auth/verify',{token,notify:true})};request.current.promise.then(value=>{if(!active)return;let page:ClientPage=readLastClientPage()||{path:'/signin',view:'page',at:Date.now()};if(page.view==='inbox'&&page.email?.toLowerCase()!==value.email.toLowerCase())page={path:'/signin',view:'page',at:Date.now()};const queued=prepareVerificationReturn(page,{type:'verified',email:value.email,at:Date.now()});announceEmailVerification(value.email,{local:!queued});router.replace(page.path,{scroll:false})},cause=>{if(!active)return;const code=errorCode(cause),page=readLastClientPage()||{path:'/signin',view:'page' as const,at:Date.now()};if(!prepareVerificationReturn(page,{type:'error',code,at:Date.now()}))announceEmailVerificationError(code);router.replace(page.path,{scroll:false})});return()=>{active=false}},[token,router]);
 return <p role="status" style={{textAlign:'center',padding:'3rem 1rem',fontSize:'.8rem'}}>{t('verifying')}</p>;
}
