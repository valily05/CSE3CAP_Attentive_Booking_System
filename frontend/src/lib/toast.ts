export const toastEvent="attentive:toast";
export type ToastIcon="success"|"error"|"mail"|"calendar"|"cancel"|"signout"|"bell"|"bellOff"|"key"|"info"|"warning";
export type ToastNotice={message:string;error:boolean;icon?:ToastIcon};
export function showToast(message:string,error=false,icon?:ToastIcon){window.dispatchEvent(new CustomEvent<ToastNotice>(toastEvent,{detail:{message,error,icon}}))}
