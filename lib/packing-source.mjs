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
 const normalized=normalize(text);
 const choices=[label,...(aliases.get(label)||[])].map(normalize);
 return choices.some(option=>{
  if(!option)return false;
  let at=normalized.indexOf(option);
  while(at>=0){
   const before=normalized.slice(Math.max(0,at-100),at);
   const after=normalized.slice(at+option.length,at+option.length+70);
   if(command.test(before)||command.test(after))return true;
   at=normalized.indexOf(option,at+option.length);
  }
  return false;
 });
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
 if(!plan||typeof plan!=='object'||!Array.isArray(plan.notices))return plan;
 const notices=plan.notices.filter(item=>!isSyntheticPackingNotice(
  typeof item==='string'?item:item?.text));
 return notices.length===plan.notices.length?plan:{...plan,notices};
}
