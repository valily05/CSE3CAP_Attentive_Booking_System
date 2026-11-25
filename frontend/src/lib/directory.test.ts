import { describe,it,expect } from "vitest";
import { ATTENTIVE_CATALOG,EXPERIENCE_AREAS,profileExperienceAreas,matchesPreferences,officialProfiles,publishedExperience, type Preferences } from "./directory";

const any:Preferences={source:"all",service:"",gender:"",experience:""};
describe("published directory filters",()=>{
 it("imports only active providers, keeps published experience bounds and never invents gender or availability",()=>{
  const profiles=officialProfiles("en",[]);
  expect(profiles).toHaveLength(21);expect(ATTENTIVE_CATALOG.services).toHaveLength(28);
  expect(profiles.every(p=>p.gender==="not_listed"&&!p.nextOpen&&!p.week)).toBe(true);
  expect(profiles.find(p=>p.name.startsWith("Syazka"))?.experienceMinYears).toBe(6);
  expect(publishedExperience(null)).toBeUndefined();expect(publishedExperience("unknown")).toBeUndefined();
 });
 it("combines service, source and minimum experience filters without substituting unrelated clinicians",()=>{
  const profiles=officialProfiles("en",[]);
  const f:Preferences={...any,source:"official",service:"official:p-konseling-dewasa",experience:"5"};
  const matches=profiles.filter(p=>matchesPreferences(p,f));expect(matches.length).toBeGreaterThan(0);
  expect(matches.every(p=>p.serviceIds.includes("p-konseling-dewasa")&&p.experienceMinYears!>=5)).toBe(true);
  expect(profiles.filter(p=>matchesPreferences(p,{...f,gender:"female"}))).toHaveLength(0);
  expect(profiles.filter(p=>matchesPreferences(p,{...any,source:"local"}))).toHaveLength(0);
 });
});

describe("individual concern mapping",()=>{
 it("splits academic and work concerns and merges repeated academic labels",()=>{
  const p={id:"p",name:"Test",title:"",specialty:"",bio:"",photoUrl:"",sessionTypes:[],locationIds:[],serviceIds:[],directoryMetadata:{areasOfExperience:["academic and work concerns","academic and school concerns","career and academics"]}};
  const topics=profileExperienceAreas(p);expect(topics).toContain("academic-concerns");expect(topics).toContain("work-concerns");expect(topics.filter(t=>t==="academic-concerns")).toHaveLength(1);
  expect(EXPERIENCE_AREAS.some(a=>a.en==="Academic and work concerns")).toBe(false);
  expect(new Set(EXPERIENCE_AREAS.map(a=>a.en.toLowerCase())).size).toBe(EXPERIENCE_AREAS.length);
  expect(new Set(EXPERIENCE_AREAS.map(a=>a.idLabel.toLowerCase())).size).toBe(EXPERIENCE_AREAS.length);
 });
});

describe("overlapping concern labels",()=>{
 it("combines confidence-related labels without dropping their original profile mappings",()=>{
  const confidence=EXPERIENCE_AREAS.find(t=>t.id==="self-confidence");expect(confidence?.sourceIds).toContain("self-confidence");expect(confidence?.sourceIds).toContain("self-esteem");expect(confidence?.sourceIds).toContain("self-worth");
  expect(EXPERIENCE_AREAS.some(t=>["self-esteem","self-efficacy","insecurity","loss","meaning-in-life","school-concerns"].includes(t.id))).toBe(false);
  expect(new Set(EXPERIENCE_AREAS.flatMap(t=>t.sourceIds)).size).toBe(117);
 });
});
