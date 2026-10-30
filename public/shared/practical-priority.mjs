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
  return {...item,aiImportance:score.importance,
   aiPrepareAhead:score.prepareAhead===true};
 }).sort((a,b)=>{
  // AI rankings have priority over the existing category/keyword heuristic.
  const approximate=x=>x.aiImportance??({0:2,1:1.5,2:1,3:0.5}[x.priority]??0);
  const aRank=approximate(a),bRank=approximate(b);
  return bRank-aRank||a.priority-b.priority||a.dayOrder-b.dayOrder;
 });
}
