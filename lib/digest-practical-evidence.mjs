/** Verify the *same* "Praktisk å huske" highlights as the family UI against
 * the school's original PDF. Only public, source-matched class information
 * is included. No user data or model calls are involved.
 */
import {dayDate} from '../public/shared/calendar.mjs';
import {profileSummary} from '../public/shared/family-core.mjs';
import {practicalHighlights} from '../public/shared/practical-highlights.mjs';
import {adultImpactType} from '../public/shared/adult-impact.mjs';

export const DIGEST_PRACTICAL_EVIDENCE_VERSION=1;
const normalize=s=>String(s||'').normalize('NFKC').toLocaleLowerCase('nb-NO')
 .replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/gu,' ').trim();
const stop=new Set('i på av og med eller til fra for som den det skal får har alle skolen skole elevene barna kl denne dette hver dag hele uka uke ukas ukens'.split(' '));
const words=s=>[...new Set(normalize(s).split(' ').filter(w=>w.length>=4&&!stop.has(w)))];
const pageText=page=>normalize((page?.items||[]).map(t=>t.text).join(' '));
const withoutDay=s=>String(s||'').replace(/^(?:mandag|tirsdag|onsdag|torsdag|fredag)\s*[:–-]\s*/iu,'').replace(/^særskilt oppmøte\s*/iu,'');
function matchWithinPage(label,body,impact){
 const statement=normalize(withoutDay(label));
 if(!statement||statement.length<10||!body)return false;
 const terms=words(statement);
 if(!terms.length)return false;
 const sourceWords=body.split(' ').filter(Boolean);
 const phrase=statement.replace(/\bkl\s+(\d)/gu,'$1');
 if(statement.length>=15&&body.includes(statement))return true;
 // A window matters: the same keywords elsewhere in a long PDF do not
 // constitute a citation for a particular event or instruction.
 const span=Math.max(12,Math.min(45,terms.length*4));
 for(let i=0;i<sourceWords.length;i++){
  if(!terms.includes(sourceWords[i]))continue;
  const window=sourceWords.slice(Math.max(0,i-4),i+span).join(' ');
  if(impact==='health'&&!/\bvaksin\w*\b|\bhelsesykepleier\b/u.test(window))continue;
  if(impact==='workday'&&adultImpactType(window)!=='workday')continue;
  if(!impact&&terms.length<3)continue;
  const present=new Set(window.split(' '));
  const match=terms.filter(w=>present.has(w)).length;
  if(match<Math.min(2,terms.length)||match/terms.length<0.8)continue;
  // "Ingen planleggingsdag" cannot support an asserted planleggingsdag.
  if(impact==='workday'&&/\b(?:ikke|ingen|uten)\s+(?:noen\s+)?(?:planleggingsdag|fridag|skolefri)\b/u.test(window)&&
   !/\b(?:ikke|ingen|uten)\b/u.test(statement))continue;
  return true;
 }
 return false;
}
/** Returns only the exact existing highlight with a verified source page. */
export function verifyPracticalDigestHighlights(plan,pages){
 if(plan?.status!=='ok'||!Array.isArray(pages)||!pages.length||
    !Number.isInteger(plan?.year)||!Number.isInteger(plan?.week))return [];
 const profile={id:'school-digest-public',name:'',school:plan.schoolId||'fagerholt',
  grade:plan.grade,group:''};
 const calendar={year:plan.year,week:plan.week,today:dayDate(plan.year,plan.week,0),upcoming:true};
 const summary=profileSummary(profile,plan,calendar,()=>null);
 if(!summary.ready)return [];
 const candidates=practicalHighlights({profiles:[profile],
  summaries:new Map([[profile.id,summary]]),plans:new Map([[profile.id,plan]]),
  calendar,focus:'week'});
 const pagesText=pages.map(pageText),out=[],seen=new Set();
 for(const item of candidates.slice(0,65)){
  const label=String(item.label||'').trim();
  if(!label||label.length>1400)continue;
  const citation=normalize(item.sourceQuote);
  const impact=adultImpactType(label);
  const pageIndex=Number.isInteger(item.sourcePage)&&item.sourcePage>=1&&item.sourcePage<=pages.length?
   item.sourcePage-1:null;
  const indexes=pageIndex===null?pagesText.map((_,i)=>i):[pageIndex];
  for(const i of indexes){
   const text=pagesText[i];
   // A source quote alone is not sufficient: ensure it is in the original PDF.
   // When legacy AI omitted citations, match the practical label locally.
   const cited=citation.length>=16&&(text.includes(citation)||
    matchWithinPage(item.sourceQuote,text,impact));
   const matched=matchWithinPage(label,text,impact);
   if(!matched&&!cited)continue;
   const key=item.kind+'|'+label;
   if(!seen.has(key)){
    seen.add(key);out.push({kind:item.kind,label,day:item.day||null,sourcePage:i+1});
   }
   break;
  }
 }
 return out.slice(0,50);
}
