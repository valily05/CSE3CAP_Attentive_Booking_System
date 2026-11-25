export const toastEvent="attentive:toast";
export function showToast(message:string,error=false){window.dispatchEvent(new CustomEvent(toastEvent,{detail:{message,error}}))}
