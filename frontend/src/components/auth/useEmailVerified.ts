"use client";
import {useEffect,useState} from "react";
import {isEmailKnownVerified,verifiedEmailsKey,verifiedEmailsChanged} from "@/lib/verified-emails";
export function useEmailVerified(email:string){const normalized=email.trim().toLowerCase();const[state,setState]=useState({email:'',verified:false});useEffect(()=>{const sync=()=>setState({email:normalized,verified:isEmailKnownVerified(normalized)});const storage=(e:StorageEvent)=>{if(e.key===verifiedEmailsKey)sync()};sync();window.addEventListener(verifiedEmailsChanged,sync);window.addEventListener('storage',storage);return()=>{window.removeEventListener(verifiedEmailsChanged,sync);window.removeEventListener('storage',storage)}},[normalized]);return state.email===normalized&&state.verified}
