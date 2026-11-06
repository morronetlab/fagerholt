/** A compact, source-backed preview. The full calendar and detail cards remain untouched. */
import {adultImpactRank,adultImpactType} from './adult-impact.mjs';

const canonical=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('nb-NO')
 .replace(/\s+/gu,' ').trim();
const planningDay=value=>/\b(?:planleggingsdag(?:er)?|lærerstevne)\b/iu.test(canonical(value));
export function importantFamilyNotices(model,{limit=3,includeOrdinaryWhenEmpty=false}={}){
 const all=[...(model?.days||[]).flatMap(day=>day.items||[]),...(model?.undated||[])];
 // If no high-priority messages exist, show actual school communications
 // instead of a seemingly empty overview. Keep family activities and homework
 // out of the important-notices preview.
 const hasImportant=all.some(item=>item?.important&&['school','municipal'].includes(item.kind));
 const fallback=includeOrdinaryWhenEmpty&&!hasImportant;
 const unique=new Map();
 for(const item of all){
  if(!item||!['school','municipal'].includes(item.kind)||(!fallback&&!item.important))continue;
  const impact=adultImpactType(item.title);
  // A school PDF and the municipal skolerute may say the same thing in
  // different words. Group ONLY the same dated planning day; do not merge
  // other events, medical notices, or closures with different reasons.
  const planning=Boolean(item.date)&&impact==='workday'&&planningDay(item.title);
  const key=planning?'planning|'+item.date:
   [item.kind,item.date||'',canonical(item.title),item.source?.url||''].join('|');
  if(unique.has(key)){
   const prior=unique.get(key);
   if(item.scope&&!prior.scopes.includes(item.scope))prior.scopes.push(item.scope);
   // Prefer the municipality's verified school-calendar label in the preview.
   // Every original notice and source still exists in expanded details/calendar.
   if(planning&&item.kind==='municipal'&&prior.kind!=='municipal'){
    Object.assign(prior,{kind:item.kind,title:item.title,source:item.source,
     category:item.category,details:item.details});
   }
  }else unique.set(key,{...item,scopes:item.scope?[item.scope]:[]});
 }
 const sorted=[...unique.values()].map(item=>({
  ...item,impact:adultImpactType(item.title),
  rank:adultImpactRank(item.title)||(item.kind==='municipal'?4:0)
 })).sort((a,b)=>b.rank-a.rank||
  (a.date||'9999-12-31').localeCompare(b.date||'9999-12-31')||
  String(a.title).localeCompare(String(b.title),'nb-NO'))
 .map(item=>({...item,scope:item.scopes.join(', ')}));
 const max=Math.min(10,Math.max(1,Math.trunc(Number(limit)||3)));
 let visible=sorted.slice(0,max);
 // Medical/vaccination information must not vanish beneath several
 // independent school closures; reserve the last preview slot for one if
 // necessary. Do not drop any source event from the expanded week model.
 const medical=sorted.find(x=>x.impact==='health');
 if(medical&&max>0&&!visible.includes(medical)){
  visible=[...visible.slice(0,max-1),medical].sort((a,b)=>b.rank-a.rank||
   (a.date||'9999-12-31').localeCompare(b.date||'9999-12-31'));
 }
 return {visible,fallback,total:sorted.length,
  remaining:Math.max(0,sorted.length-visible.length),
  undated:sorted.filter(item=>!item.date).length};
}
