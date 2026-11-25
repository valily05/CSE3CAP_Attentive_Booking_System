export const residenceCountries = ["ID", "SG", "CN", "JP", "AU", "OTHER"] as const;
export const residenceZones: Record<string, string[]> = {
 ID:["Asia/Jakarta","Asia/Makassar","Asia/Jayapura"], SG:["Asia/Singapore"], CN:["Asia/Shanghai"], JP:["Asia/Tokyo"],
 AU:["Australia/Sydney","Australia/Melbourne","Australia/Brisbane","Australia/Adelaide","Australia/Darwin","Australia/Perth","Australia/Hobart","Australia/Lord_Howe","Australia/Eucla"],
};
export const residenceCities: Record<string, Record<string,string>> = {
 ID:{Jakarta:"Asia/Jakarta",Bandung:"Asia/Jakarta",Surabaya:"Asia/Jakarta",Medan:"Asia/Jakarta",Yogyakarta:"Asia/Jakarta",Semarang:"Asia/Jakarta",Malang:"Asia/Jakarta",Denpasar:"Asia/Makassar",Makassar:"Asia/Makassar",Balikpapan:"Asia/Makassar",Jayapura:"Asia/Jayapura"},
 SG:{Singapore:"Asia/Singapore"},CN:{Beijing:"Asia/Shanghai",Shanghai:"Asia/Shanghai",Guangzhou:"Asia/Shanghai",Shenzhen:"Asia/Shanghai",Chengdu:"Asia/Shanghai",Hangzhou:"Asia/Shanghai"},
 JP:{Tokyo:"Asia/Tokyo",Osaka:"Asia/Tokyo",Kyoto:"Asia/Tokyo",Yokohama:"Asia/Tokyo",Nagoya:"Asia/Tokyo",Sapporo:"Asia/Tokyo",Fukuoka:"Asia/Tokyo"},
 AU:{Sydney:"Australia/Sydney",Melbourne:"Australia/Melbourne",Brisbane:"Australia/Brisbane",Perth:"Australia/Perth",Adelaide:"Australia/Adelaide",Darwin:"Australia/Darwin",Hobart:"Australia/Hobart",Canberra:"Australia/Sydney","Gold Coast":"Australia/Brisbane",Eucla:"Australia/Eucla"},
};
export function zoneLabel(zone: string, city?: string): string {
 // Residence-zone labels intentionally show the selected zone, rather than appointment times in WIB.
 // eslint-disable-next-line attentive/wib-time-only
 const offset=new Intl.DateTimeFormat("en",{timeZone:zone,timeZoneName:"shortOffset"}).formatToParts(new Date()).find(part=>part.type==="timeZoneName")?.value || "GMT";
 return `${city || zone.split("/").at(-1)?.replaceAll("_"," ") || zone} (${offset})`;
}
