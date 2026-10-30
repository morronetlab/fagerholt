import {adultImpactRank} from './adult-impact.mjs';
import {verifiedDigestExcerpt} from './practical-digest.mjs';
/** Stable identity for the same public-school notice across family profiles. */
export function priorityKey(item){
 const normalized=String(item?.label||'').normalize('NFKC').trim().replace(/\s+/g,' ')
  .toLocaleLowerCase('nb-NO');
 return String(item?.kind||'notice')+'|'+normalized;
}
export function applyPracticalPriority(items,scores){
 return items.map(item=>{
  const score=typeof scores==='function'?scores(item):scores?.[priorityKey(item)];
  if(!score||!Number.isInteger(score.importance)||score.importance<0||score.importance>3)
   return item;
  const shortText=verifiedDigestExcerpt(item.label,score.shortText,145);
  return {...item,aiImportance:score.importance,
   aiPrepareAhead:score.prepareAhead===true,
   ...(shortText?{aiShortText:shortText}:{})};
 }).sort((a,b)=>{
  // Deterministic safety floor: even when AI misranks a planleggingsdag
  // as unimportant, school closure / workday changes must come first.
  const impactDiff=adultImpactRank(b.label)-adultImpactRank(a.label);
  if(impactDiff)return impactDiff;
  const approximate=x=>x.aiImportance??({0:2,1:1.5,2:1,3:0.5}[x.priority]??0);
  const aRank=approximate(a),bRank=approximate(b);
  return bRank-aRank||a.priority-b.priority||a.dayOrder-b.dayOrder;
 });
}
