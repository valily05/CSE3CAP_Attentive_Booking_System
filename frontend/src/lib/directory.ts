import experienceTopics from "@/data/experience-topics.json";
import snapshot from "@/data/attentive-catalog.json";
import demoData from "@/data/demo-profile-metadata.json";
import type { AgeGroup, Location, Psychologist } from "./types";

export const ATTENTIVE_CATALOG=snapshot;
export const EXPERIENCE_AREAS=experienceTopics.topics;
export function profileExperienceAreas(p:Psychologist) {
 const source=new Set(p.directoryMetadata?.areasOfExperience??[]);
 return EXPERIENCE_AREAS.filter(topic=>topic.sourceIds.some(id=>source.has(id))).map(topic=>topic.id);
}
export type Gender="female"|"male"|"non_binary"|"not_listed";
export type DirectoryProfile=Psychologist&{origin?:"official"|"demo";gender?:Gender;experienceMinYears?:number;experienceLabel?:string;officialUrl?:string;ageGroups?:AgeGroup[]};
export type Preferences={source:"all"|"local"|"official";service:string;gender:string;experience:string};
export function publishedExperience(value:string|null):number|undefined {
  if(!value)return undefined;
  const match=value.match(/^\s*(?:>|>=|≥)?\s*(\d+)\s*(?:Tahun|years?)\s*$/i);
  return match?Number(match[1]):undefined;
}
export function localDirectoryProfile(p:Psychologist):DirectoryProfile {
  const sample=(demoData as Record<string,{name:string;gender:string}>)[p.id];
  if(p.directoryMetadata)return {...p,gender:p.directoryMetadata.gender??"not_listed",experienceMinYears:p.directoryMetadata.experienceMinYears,experienceLabel:p.directoryMetadata.experienceLabel};
  return sample?.name===p.name?{...p,origin:"demo",gender:sample.gender as Gender}:{...p};
}
export function officialProfiles(locale:"en"|"id",locations:Location[]):DirectoryProfile[] {
  return snapshot.providers.filter(p=>p.active).map<DirectoryProfile>(p=>{
    const services=snapshot.services.filter(s=>p.serviceIds.includes(s.id));
    const modes=new Set(services.flatMap(s=>s.modes));
    const ages=new Set<AgeGroup>();
    for(const s of services){
      if(s.audience.includes("Dewasa"))ages.add("adult");
      if(s.audience.some(a=>a==="Anak"||a==="Remaja"))ages.add("child_teen");
      if(["p-konseling-couple","p-konseling-family","p-prepare-enrich"].includes(s.id))ages.add("family_couple");
    }
    return {id:`official:${p.id}`,name:p.name,title:locale==="en"?p.titleEn:p.title,specialty:p.specialties.join(", "),bio:"",photoUrl:p.photoUrl,serviceIds:p.serviceIds,sessionTypes:[...(modes.has("Online")?["video" as const]:[]),...(modes.has("Offline")?["in_person" as const]:[])],locationIds:p.branchIds.map(id=>{
      const branch=snapshot.branches.find(b=>b.id===id);
      return locations.find(l=>branch&&l.name.toLocaleLowerCase().startsWith(branch.name.toLocaleLowerCase()))?.id??`official:${id}`;
    }),origin:"official",gender:"not_listed",experienceMinYears:publishedExperience(p.experience),experienceLabel:locale==="en"?p.experience?.replace(/Tahun/gi,"years"):p.experience??undefined,officialUrl:p.profileUrl,ageGroups:[...ages]};
  });
}
export function matchesPreferences(p:DirectoryProfile,f:Preferences):boolean {
  if(f.source==="local"&&p.origin==="official"||f.source==="official"&&p.origin!=="official")return false;
  if(f.gender&&(p.gender??"not_listed")!==f.gender)return false;
  if(f.experience==="not_listed"&&p.experienceMinYears!==undefined)return false;
  const ranges:Record<string,[number,number]>={under3:[0,2],"3to6":[3,6],"7to9":[7,9],"10plus":[10,Infinity]};
  const range=ranges[f.experience];
  if(range&&(p.experienceMinYears===undefined||p.experienceMinYears<range[0]||p.experienceMinYears>range[1]))return false;
  if(!range&&f.experience&&f.experience!=="not_listed"&&(p.experienceMinYears===undefined||p.experienceMinYears<Number(f.experience)))return false;
  if(f.service){const split=f.service.indexOf(":");const source=f.service.slice(0,split),id=f.service.slice(split+1);if((source==="official")!==(p.origin==="official")||!p.serviceIds.includes(id))return false;}
  return true;
}
