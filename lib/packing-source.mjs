/** Only concrete school-PDF instructions may become required packing.
 * An AI quote or inferred activity is not evidence by itself: PDF.js must
 * corroborate the instruction and the named item on the same source page.
 */
const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('nb-NO')
 .replace(/[–—-]/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const command=/(?:^| )(?:ta med|ha med|skal ha med|må ha med|kan ha med|kan ta med|ta gjerne med|husk|pakk|pakke|kan pakke|legg i sekken|legge i skolesekken)(?: |$)/u;
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
 const item=normalize(label);
 if(!item||!String(sourceQuote||'').trim()||!String(pageText||'').trim())return false;
 // Keep sentence boundaries intact until the corroboration checks finish.
 return hasLocalInstruction(sourceQuote,item)&&hasLocalInstruction(pageText,item);
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

/** Read unambiguous weekday + explicit equipment from adjacent PDF text lines.
 * Handles a real school paragraph whose first line names the day and the next
 * line says "kan ta med ...". Does not infer gear from a timetable or event.
 */
const DAYS=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
const SOURCE_GEAR=[
 ['Bålmat',/\bbålmat(?:en)?\b/iu],
 ['Vedkubbe',/\bvedkubbe(?:n|r)?\b/iu],
 ['Bamse',/\bbamse(?:n)?\b/iu]
];
const sourceRows=page=>{
 const rows=[];
 for(const t of (page?.items||[]).filter(x=>Number.isFinite(x.x)&&Number.isFinite(x.y)&&String(x.text||'').trim())
  .sort((a,b)=>a.y-b.y||a.x-b.x)){
  const row=rows.at(-1);
  if(row&&Math.abs(row.y-t.y)<=3){
   row.parts.push(t);row.left=Math.min(row.left,t.x);
  }else rows.push({y:t.y,left:t.x,parts:[t]});
 }
 return rows.map(row=>({
  y:row.y,left:row.left,
  text:row.parts.sort((a,b)=>a.x-b.x).map(x=>x.text).join(' ').replace(/\s+/gu,' ').trim()
 }));
};
export function extractExplicitSchoolPacking(pages){
 const output=[],seen=new Set();
 for(let pi=0;pi<(Array.isArray(pages)?pages:[]).length;pi++){
  const page=pages[pi];
  if(!(page?.width>0))continue;
  const rows=sourceRows(page);
  for(let i=0;i<rows.length;i++){
   const current=rows[i];
   const neighbors=rows.filter((other,j)=>Math.abs(j-i)<=1&&
    Math.abs(other.y-current.y)<=22&&
    Math.abs(other.left-current.left)<=Math.max(65,page.width*.10));
   const context=neighbors.map(row=>row.text).join(' ');
   const dayNames=DAYS.filter(day=>new RegExp('\\b'+day+'\\b','iu').test(context));
   if(dayNames.length!==1)continue;
   for(const [label,pattern] of SOURCE_GEAR){
    if(!pattern.test(current.text))continue;
    if(!explicitPackingInPdf(label,context,context))continue;
    const near=context.search(pattern);
    const previous=context.slice(Math.max(0,near-110),near);
    const next=context.slice(near,near+75);
    // Conditional/permission wording must not be turned into a requirement.
    const optional=/\b(?:kan|gjerne|valgfritt|frivillig|vil|hvis du har|hvis dere har|har lyst)\b/iu
      .test(previous+' '+next);
    const key=[pi,dayNames[0],label].join('|');
    if(seen.has(key))continue;seen.add(key);
    output.push({day:dayNames[0],label:optional?label+' (valgfritt)':label,
      sourcePage:pi+1,sourceQuote:context.slice(0,350)});
   }
  }
 }
 return output;
}
