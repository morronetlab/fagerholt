/** Deterministic parent-impact guardrail, applied on already sourced school facts.
 * A model cannot demote school closure or changed care/pickup arrangements.
 * This classifier NEVER generates an event or an instruction of its own.
 */
const norm=value=>String(value??'').normalize('NFKC')
 .toLocaleLowerCase('nb-NO').replace(/\s+/g,' ').trim();
const dayPrefix=/^(?:mandag|tirsdag|onsdag|torsdag|fredag)\s*[:–-]\s*/u;
const schoolClosure=/\b(?:planleggingsdag(?:er)?|skolefri|skolefridag|undervisningsfri|elevfri|fridag(?:er)?|høstferie|vinterferie|påskeferie|juleferie|sommerferie)\b/u;
const closed=/\b(?:skolen|skole|sfo|aks|skolefritidsordningen|undervisningen|trinnet)\b.{0,65}\b(?:stengt|steng[te]r|holder stengt|avlyst|utgår|ingen undervisning)\b/u;
const reversedClosed=/\b(?:stengt|steng[te]r|holder stengt|avlyst|ingen undervisning)\b.{0,65}\b(?:skolen|skole|sfo|aks|skolefritidsordningen|undervisningen)\b/u;
const freePupils=/\b(?:elevene|barna|skoleelevene|alle elever|alle barn)\s+(?:har|får|skal ha)\s+fri\b|\bfri fra (?:skolen|undervisningen)\b/u;
const changedSchoolHours=/\b(?:skolen|skoledagen|undervisningen|elevene|barna|sfo|aks)\b.{0,75}\b(?:slutter tidligere|slutter seinere|starter senere|starter seinere|starter tidligere|kortere dag|forkortet skoledag|endret sluttid|endret starttid|endret åpningstid|redusert åpningstid|endret hentetid)\b/u;
const reversedHours=/\b(?:tidligere slutt|senere start|seinere start|endret starttid|endret sluttid|kortere skoledag|forkortet skoledag|sfo stenger|sfo åpner)\b/u;
const pickupChange=/\b(?:endret|nytt|annerledes|endring(?:er)? i|spesiell)\b.{0,65}\b(?:henting|hentetid|levering|oppmøtetid|oppmøtested|skolestart)\b|\b(?:henting|hentetid|levering|oppmøtetid|oppmøtested|skolestart)\b.{0,65}\b(?:endret|nytt|annerledes)\b/u;
const health=/\bvaksin[\p{L}]*\b|\b(?:helsesykepleier|helsestasjon)\b.{0,65}\b(?:time|besøk|undersøkelse|oppmøte|vaksin)\b/u;

/** 'workday' impacts care, school attendance or parents' working hours.
 * 'health' requires attention, but normally does not outrank a closure.
 */
export function adultImpactType(value){
 const text=norm(value),withoutDay=text.replace(dayPrefix,'');
 if(!text)return null;
 if(schoolClosure.test(text)||closed.test(text)||reversedClosed.test(text)||
  freePupils.test(text)||/^(?:fri|ingen skole|skolen stengt|sfo stengt)(?:[.!]|\s+for (?:elevene|barna))?$/u.test(withoutDay)||
  changedSchoolHours.test(text)||reversedHours.test(text)||pickupChange.test(text))
   return 'workday';
 if(health.test(text))return 'health';
 return null;
}
export function adultImpactRank(value){
 return adultImpactType(value)==='workday'?5:adultImpactType(value)==='health'?4:0;
}
