export const verifiedEmailsKey='attentive.verified-emails.v1';
export const verifiedEmailsChanged='attentive:verified-emails-changed';
type Receipt={email:string;at:number};
function receipts():Receipt[]{try{const raw=JSON.parse(localStorage.getItem(verifiedEmailsKey)||'[]');return Array.isArray(raw)?raw.filter(x=>x&&typeof x.email==='string'&&typeof x.at==='number'&&Date.now()-x.at<24*60*60*1000):[]}catch{return []}}
export function isEmailKnownVerified(email:string){return receipts().some(x=>x.email===email.trim().toLowerCase())}
export function rememberVerifiedEmail(email:string){const normalized=email.trim().toLowerCase();if(!normalized)return;try{localStorage.setItem(verifiedEmailsKey,JSON.stringify([{email:normalized,at:Date.now()},...receipts().filter(x=>x.email!==normalized)].slice(0,20)))}catch{}window.dispatchEvent(new Event(verifiedEmailsChanged))}
export function forgetVerifiedEmail(email:string){try{localStorage.setItem(verifiedEmailsKey,JSON.stringify(receipts().filter(x=>x.email!==email.trim().toLowerCase())))}catch{}window.dispatchEvent(new Event(verifiedEmailsChanged))}
