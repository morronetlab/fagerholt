/** Coverage audit for critical school facts in the ORIGINAL PDF text layer.
 * This audits the existing AI plan; it never creates new school instructions.
 * Results are diagnostic. Image-only PDFs are explicitly "unverified".
 */
import {dayDate} from '../public/shared/calendar.mjs';
import {profileSummary} from '../public/shared/family-core.mjs';
import {practicalHighlights} from '../public/shared/practical-highlights.mjs';
import {adultImpactType} from '../public/shared/adult-impact.mjs';

const normalize=x=>String(x||'').normalize('NFKC').toLocaleLowerCase('nb-NO').replace(/\s+/gu,' ').trim();
const signature=x=>({
 workday:/\b(?:planleggingsdag|skolefri|skolefridag|fridag|elevfri|undervisningsfri|stengt|stenger|stenger tidligere|slutter tidligere|starter senere|endret hentetid|endret oppmøte|høstferie|vinterferie|påskeferie|juleferie|sommerferie)\b/u,
 health:/\bvaksin[\p{L}]*\b|\b(?:helsesykepleier|helsestasjon)\b/u
}[x]);
const importantWords=/(?:planleggingsdag|skolefri|fridag|elevfri|undervisningsfri|stengt|stenger|slutter|starter|hentetid|oppmøte|vaksin[\p{L}]*|helsesykepleier)/giu;

export function criticalSourceSegments(pageTexts){
 const results=[],seen=new Set();
 for(let index=0;index<pageTexts.length;index++){
  const page=normalize(pageTexts[index]);
  if(!page)continue;
  // Page-level PDF.js text may be flattened, so capture limited context around
  // each critical term instead of trusting sentence boundaries or page titles.
  const matches=[...page.matchAll(importantWords)].slice(0,60);
  for(const match of matches){
   const left=Math.max(0,match.index-80),right=Math.min(page.length,match.index+100);
   const raw=page.slice(left,right);
   const sentence=raw.split(/[.!?;\n]/u).find(part=>part.includes(match[0]))||raw;
   const text=sentence.trim();
   const type=adultImpactType(text);
   if(!type)continue;
   const key=type+'|'+index+'|'+match[0];
   if(seen.has(key))continue;seen.add(key);
   results.push({type,sourcePage:index+1,sourceExcerpt:text.slice(0,180),
    keyword:match[0]});
  }
 }
 return results.slice(0,100);
}
export function auditPracticalSource(plan,pageTexts=[]){
 const texts=Array.isArray(pageTexts)?pageTexts.filter(x=>typeof x==='string'):[];
 if(texts.reduce((sum,x)=>sum+x.trim().length,0)<40)
  return {status:'unverified',reason:'No usable PDF text layer',sourceFacts:0,missing:0,unsupported:0};
 if(!plan||!Number.isInteger(plan.year)||!Number.isInteger(plan.week))
  return {status:'unverified',reason:'Invalid plan',sourceFacts:0,missing:0,unsupported:0};
 const profile={id:'public-pdf-audit',name:'',school:plan.schoolId||'fagerholt',
  grade:plan.grade||'',group:''};
 const cal={year:plan.year,week:plan.week,today:dayDate(plan.year,plan.week,0),upcoming:true};
 const summary=profileSummary(profile,plan,cal);
 if(!summary.ready)return {status:'unverified',reason:'Plan not ready',
  sourceFacts:0,missing:0,unsupported:0};
 const highlights=practicalHighlights({profiles:[profile],
  summaries:new Map([[profile.id,summary]]),
  plans:new Map([[profile.id,plan]]),calendar:cal,focus:'week'});
 const source=criticalSourceSegments(texts);
 const matching=(fact,text)=>adultImpactType(text)===fact.type &&
  (normalize(text).includes(fact.keyword.slice(0,5))||
   normalize(fact.sourceExcerpt).includes(normalize(text).replace(
    /^(?:mandag|tirsdag|onsdag|torsdag|fredag)\s*[:–-]\s*/u,'').slice(0,17)));
 const missing=source.filter(fact=>!highlights.some(item=>matching(fact,item.label))).length;
 const unsupported=highlights.filter(item=>item.adultImpact&&!source.some(fact=>
  matching({type:item.adultImpact,keyword:normalize(item.label).match(importantWords)?.[0]||'',
   sourceExcerpt:item.label},fact.sourceExcerpt))).length;
 return {status:missing||unsupported?'attention':'ok',sourceFacts:source.length,
  missing,unsupported};
}
