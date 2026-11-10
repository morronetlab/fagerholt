import {DAYS} from './calendar.mjs';

/**
 * Presentation-only grouping: indices always refer to the already expanded
 * homework array used by localStorage and family cloud progress.
 * Never merge unrelated assignments just because their text looks similar.
 */
export function homeworkDisplayGroups(items){
 const groups=[];
 const list=Array.isArray(items)?items:[];
 for(let i=0;i<list.length;){
  const item=list[i];
  const repeated=Array.isArray(item?.repeatDays)
   ? DAYS.filter(day=>item.repeatDays.includes(day)):[];
  const signature=task=>JSON.stringify([
   task?.text,task?.subject,task?.group,task?.dueDay,task?.sourceQuote,
   task?.optional,task?.repeatDays
  ]);
  if(repeated.length>=2&&repeated.includes(item.repeatDay)){
   const entries=[];
   let j=i;
   while(j<list.length&&list[j]?.repeatDay&&
     repeated.includes(list[j].repeatDay)&&
     signature(list[j])===signature(item)&&
     !entries.some(entry=>entry.day===list[j].repeatDay)){
    entries.push({index:j,day:list[j].repeatDay});
    j++;
   }
   if(entries.length===repeated.length&&
     repeated.every(day=>entries.some(entry=>entry.day===day))){
    groups.push({kind:'daily',item,index:i,entries});
    i=j;
    continue;
   }
  }
  groups.push({kind:'single',item,index:i});
  i++;
 }
 return groups;
}
