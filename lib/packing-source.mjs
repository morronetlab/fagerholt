/** Only concrete school-PDF instructions may become required packing.
 * An AI quote or inferred activity is not evidence by itself: PDF.js must
 * corroborate the instruction and the named item on the same source page.
 */
const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('nb-NO')
 .replace(/[–—-]/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const command=/(?:^| )(?:ta med|ha med|skal ha med|må ha med|husk|pakk)(?: |$)/u;
const aliases=new Map([
 ['gymtøy',['gymklær','treningstøy']],['gymsko',['innesko']],
 ['badetøy',['badedrakt','badebukse']],['skiftetøy',['skifteklær']],
 ['dusjetøy',['dusjutstyr']],['engelskboka',['engelsk bok','engelsk boken']],
 ['norskboka',['norsk bok','norsk boken']]
]);
function hasLocalInstruction(text,label){
 const choices=[label,...(aliases.get(label)||[])].map(normalize);
 // Do not borrow a "husk" from a different sentence on the same page.
 for(const sentence of String(text||'').split(/[.!?;\n]+/u)){
  const part=normalize(sentence);
  for(const option of choices){
   if(!option)continue;
   let at=part.indexOf(option);
   while(at>=0){
    const before=part.slice(Math.max(0,at-90),at);
    if(command.test(before))return true;
    at=part.indexOf(option,at+option.length);
   }
  }
 }
 return false;
}

/**
 * Conservative: reject when PDF text is unavailable, or when the model's
 * source quote and original page don't independently support the instruction.
 * The user can always inspect the linked original PDF.
 */
export function explicitPackingInPdf(label,sourceQuote,pageText){
 const item=normalize(label),quote=normalize(sourceQuote),page=normalize(pageText);
 if(!item||!quote||!page)return false;
 return hasLocalInstruction(quote,item)&&hasLocalInstruction(page,item);
}
/** Remove historical notices synthesized by earlier parser versions.
 * The note itself is app text, not something the school published.
 */
export const isSyntheticPackingNotice=value=>
 /^ta med:\s*.+\s*\(sjekk hvilken dag i pdf-en\)\s*\.?$/iu.test(String(value||'').trim());
export function stripSyntheticPackingNotices(plan){
 if(!plan||typeof plan!=='object')return plan;
 const noticesFiltered=Array.isArray(plan.notices)?plan.notices.filter(item=>
  !isSyntheticPackingNotice(typeof item==='string'?item:item?.text)):plan.notices;
 const notices=noticesFiltered?.length===plan.notices?.length?plan.notices:noticesFiltered;
 // Older cached AI results may still carry equipment inferred from activities.
 // Such suggestions must not masquerade as an obligatory packing instruction.
 const explicit=gear=>gear?.note!=='Forslag ut fra aktivitet i PDF-en';
 const everydayFiltered=Array.isArray(plan.everyday)?plan.everyday.filter(explicit):plan.everyday;
 const everyday=everydayFiltered?.length===plan.everyday?.length?plan.everyday:everydayFiltered;
 let days=plan.days;
 if(days&&typeof days==='object'){
  let changed=false;
  const entries=Object.entries(days).map(([day,value])=>{
   if(!Array.isArray(value?.bring))return [day,value];
   const bring=value.bring.filter(explicit);
   if(bring.length!==value.bring.length)changed=true;
   return [day,bring.length===value.bring.length?value:{...value,bring}];
  });
  if(changed)days=Object.fromEntries(entries);
 }
 return notices===plan.notices&&everyday===plan.everyday&&days===plan.days?
  plan:{...plan,notices,everyday,days};
}
