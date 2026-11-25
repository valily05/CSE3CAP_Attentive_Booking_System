export type ResidenceDetails={country:string;otherCountry:string;city:string;timeZone:string};
type Recovery={email:string;residence?:ResidenceDetails;expires:number};
const key="attentive.registration-recovery.v1";
export function saveRegistrationRecovery(email:string,residence?:ResidenceDetails){try{localStorage.setItem(key,JSON.stringify({email:email.trim().toLowerCase(),residence,expires:Date.now()+12*60*60*1000}))}catch{}}
export function readRegistrationRecovery():Recovery|null{try{const raw=localStorage.getItem(key);if(!raw)return null;const value=JSON.parse(raw);if(typeof value.email!=="string"||!value.email||typeof value.expires!=="number"||value.expires<Date.now()){localStorage.removeItem(key);return null}if(value.residence&&!['country','otherCountry','city','timeZone'].every(k=>typeof value.residence[k]==="string"))delete value.residence;return value}catch{return null}}
export function clearRegistrationRecovery(email:string){try{if(readRegistrationRecovery()?.email===email.trim().toLowerCase())localStorage.removeItem(key)}catch{}}
export function recoveryLoginHref(){return readRegistrationRecovery()?.residence?"/signin?next=/account/residence":"/signin"}
