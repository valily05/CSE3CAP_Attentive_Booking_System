"use client";
import {ResendVerificationForm} from "./AuthForms";
import {VerifyEmailReturn} from "./VerifyEmailReturn";
export function ResendVerificationPanel({token=""}:{token?:string}){return token?<VerifyEmailReturn token={token}/>:<ResendVerificationForm/>}
