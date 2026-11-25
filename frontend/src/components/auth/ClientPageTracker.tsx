"use client";
import {useEffect} from "react";
import {usePathname,useSearchParams} from "next/navigation";
import {clientPageEvent,rememberClientPage,takeVerificationReturnNotice} from "@/lib/verification-return";
import {emailVerificationEvent} from "@/lib/email-verification";
export function ClientPageTracker(){const pathname=usePathname(),search=useSearchParams().toString();useEffect(()=>{const record=()=>{rememberClientPage();const notice=takeVerificationReturnNotice();if(notice)window.dispatchEvent(new CustomEvent(emailVerificationEvent,{detail:notice}))};record();window.addEventListener('focus',record);window.addEventListener('hashchange',record);window.addEventListener('popstate',record);window.addEventListener(clientPageEvent,record);document.addEventListener('visibilitychange',record);return()=>{window.removeEventListener('focus',record);window.removeEventListener('hashchange',record);window.removeEventListener('popstate',record);window.removeEventListener(clientPageEvent,record);document.removeEventListener('visibilitychange',record)}},[pathname,search]);return null}
