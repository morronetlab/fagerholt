/** A compact top-of-page summary derived solely from the existing week model.
 * This never invents notices or sources, even when a notice has no known date.
 */
import {adultImpactRank,adultImpactType} from './adult-impact.mjs';

const canonical=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('nb-NO')
 .replace(/\s+/gu,' ').trim();
export function importantFamilyNotices(model,{limit=3}={}){
 const all=[...(model?.days||[]).flatMap(day=>day.items||[]),...(model?.undated||[])];
 const unique=new Map();
 for(const item of all){
  if(!item?.important||!['school','municipal'].includes(item.kind))continue;
  const key=[item.kind,item.date||'',canonical(item.title),item.source?.url||''].join('|');
  if(unique.has(key)){
   const prior=unique.get(key);
   if(item.scope&&!prior.scopes.includes(item.scope))prior.scopes.push(item.scope);
  }else unique.set(key,{...item,scopes:item.scope?[item.scope]:[]});
 }
 const sorted=[...unique.values()].map(item=>({
  ...item,impact:adultImpactType(item.title),
  // Municipal school-calendar notices are explicitly marked important.
  rank:adultImpactRank(item.title)||(item.kind==='municipal'?4:0)
 })).sort((a,b)=>b.rank-a.rank||
  (a.date||'9999-12-31').localeCompare(b.date||'9999-12-31')||
  String(a.title).localeCompare(String(b.title),'nb-NO'))
 .map(item=>({...item,scope:item.scopes.join(', ')}));
 const max=Math.min(10,Math.max(1,Math.trunc(Number(limit)||3)));
 return {visible:sorted.slice(0,max),total:sorted.length,
  remaining:Math.max(0,sorted.length-max),
  undated:sorted.filter(item=>!item.date).length};
}
