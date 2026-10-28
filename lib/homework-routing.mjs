/** Route unmistakable practical notes out of homework, regardless of PDF table heading. */
export const SCHOOL_DAYS=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
const dayRx=/(?<![\p{L}])(?:mandag|tirsdag|onsdag|torsdag|fredag)(?![\p{L}])/iu;
const vaccineStart=/^(?:vaksin[\p{L}]*|tetravac|skolevaksin[\p{L}]*)(?![\p{L}])/iu;
const packingStart=/^(?:(?:ta|ha)\s+med|husk\s+(?:(?:å\s+)?ta\s+med\s+)?(?:gym|inne|bade|svømme|skifte|tur)[\p{L}]*|pakk(?:\s+med)?)(?![\p{L}])/iu;
const homeworkDue=/^(?:(?:lekser?|hjemmearbeid)\s+)?til\s+(?:mandag|tirsdag|onsdag|torsdag|fredag)\s*:\s*/iu;
const trim=s=>String(s||'').replace(/\s+/g,' ').trim();
export function weekdayFromText(text){
 const m=trim(text).match(dayRx);
 return m?SCHOOL_DAYS.find(day=>day.toLocaleLowerCase('nb-NO')===m[0].toLocaleLowerCase('nb-NO'))||null:null;
}
export function splitPracticalHomework(text){
 // Split only at unmistakable new logistics/vaccination instructions. Do not
 // split ordinary multi-sentence reading homework ("Read ... 3 times").
 const pieces=String(text||'').split(/(?:[.!?]\s+|\n+)(?=(?:vaksin[\p{L}]*|tetravac|ta\s+med|ha\s+med|husk\s+(?:å\s+)?ta\s+med)\b)/iu);
 return pieces.map(trim).filter(Boolean);
}
export function classifyHomeworkText(text){
 const stripped=trim(text).replace(homeworkDue,'').replace(/^(?:norsk|engelsk|matematikk|matte|naturfag|krle|samfunnsfag|lesing|ukelekse)\s*:\s*/iu,'').trim();
 if(vaccineStart.test(stripped))return {kind:'vaccine',text:stripped,day:weekdayFromText(stripped)};
 if(packingStart.test(stripped))return {kind:'packing',text:stripped,day:weekdayFromText(stripped)};
 return {kind:'homework',text:trim(text),day:null};
}
export function packingLabels(text){
 const parts=trim(text).replace(/^(?:ta|ha)\s+med\s*/iu,'').replace(/^husk\s+(?:(?:å\s+)?ta\s+med\s+)?/iu,'').replace(/^pakk(?:\s+med)?\s*/iu,'').replace(/[.!]+$/,'').trim();
 const labels=[
  ['Gymsko',/(?:^|\s)(?:gymsko|innesko)(?:$|\s)/iu],
  ['Gymtøy',/(?:^|\s)(?:gymtøy|gymklær)(?:$|\s)/iu],
  ['Badetøy',/(?:^|\s)(?:badetøy|badebukse|badedrakt)(?:$|\s)/iu],
  ['Håndkle',/(?:^|\s)håndkle(?:$|\s)/iu],
  ['Skiftetøy',/(?:^|\s)skiftetøy(?:$|\s)/iu]
 ].filter(([,pattern])=>pattern.test(parts)).map(([label])=>label);
 return labels.length?labels:(parts&&parts.length<=85?[parts]:[]);
}
