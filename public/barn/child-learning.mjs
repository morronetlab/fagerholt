/** Child-only learning model. Preserve all group labels and PDF due dates.
 * Completion is local to this device; no Supabase writes or parental privileges.
 */
import {DAYS} from '../shared/calendar.mjs';
import {groupApplies} from '../shared/family-core.mjs';
import {expandHomework,repeatDayLabel} from '../shared/homework-view.mjs';
import {dueDayLabel,packingText} from '../shared/plan-display.mjs';
import {uniqueDayEvents,groupSimultaneousEvents,notesWithImportantEvents} from '../shared/day-view.mjs';

const norm=s=>String(s??'').normalize('NFC').toLocaleLowerCase('nb-NO').replace(/\s+/gu,' ').trim();
const cleaned=s=>String(s??'').trim();
export function scopedHomeworkItems(plan,child){
 return expandHomework(plan?.homework||[]).map((task,index)=>({
  ...task,index,
  dueLabel:dueDayLabel(task,{allowTextFallback:plan?.parser!=='ai'})||null,
  repeatLabel:repeatDayLabel(task),
  // Keep the PDF's original dueDay unchanged for the shared homework fingerprint.
  // A repeated weekday is already represented by repeatDay; replacing dueDay
  // would produce a different key from the guardian and reject cloud writes.
  effectiveDueDay:task.repeatDay||task.dueDay||null
 })).filter(item=>groupApplies(item,child));
}
export function scopedPackingItems(plan,child,day){
 const entries=[...(plan?.everyday||[]),...(plan?.days?.[day]?.bring||[])];
 const found=new Map();
 for(const item of entries){
  if(!groupApplies(item,child))continue;
  const label=cleaned(item?.label||item?.text||item);
  if(!label)continue;
  const key=norm(label)+'|'+norm(item?.group);
  if(!found.has(key))found.set(key,{label:packingText(label),group:item?.group||null,
   note:cleaned(item?.note),key});
 }
 return [...found.values()];
}
/** The child's own-group timeline is primary; other class-group instructions
 * remain discoverable in a clearly labelled secondary section, not omitted.
 * These are public school-PDF events, never sibling/family private activities.
 */
export function childSchoolDayDetails(plan,child,day){
 const all=uniqueDayEvents(plan?.days?.[day]?.events||[]);
 const own=all.filter(item=>groupApplies(item,child));
 const other=all.filter(item=>!groupApplies(item,child)&&item.group);
 const notes=notesWithImportantEvents(own,(plan?.dayNotes?.[day]||[])
  .filter(x=>groupApplies(x,child)));
 const attendance=(plan?.attendance||[]).filter(x=>x.day===day&&groupApplies(x,child));
 return {own:groupSimultaneousEvents(own),
  other:groupSimultaneousEvents(other),
  notes,attendance};
}
export function childCheckedKey({id},year,week,kind,day='all'){
 if(!/^[a-zA-Z0-9-]{8,80}$/u.test(id))throw Error('Ugyldig barneprofil');
 if(!Number.isInteger(year)||!Number.isInteger(week)||year<2020||year>2100||week<1||week>53)
  throw Error('Ugyldig uke');
 if(!['homework','bag'].includes(kind))throw Error('Ugyldig liste');
 if(day!=='all'&&!DAYS.includes(day))throw Error('Ugyldig skoledag');
 return ['skoleuka.child.checked.v1',id,year,week,kind,day].join('.');
}
export function readChildChecks(storage,key){
 try{const data=JSON.parse(storage.getItem(key)||'{}');
  if(!data||Array.isArray(data)||typeof data!=='object')return {};
  return Object.fromEntries(Object.entries(data).filter(([k,v])=>
   k.length<=150&&typeof v==='boolean').slice(0,150));
 }catch{return {};}
}
export function setChildCheck(storage,key,itemKey,checked){
 if(typeof itemKey!=='string'||itemKey.length>150)throw Error('Ugyldig avkrysning');
 const value=readChildChecks(storage,key);
 value[itemKey]=Boolean(checked);
 storage.setItem(key,JSON.stringify(value));
 return value;
}
export function homeworkItemKey(item){
 // Stable across group filtering: original PDF index, not visible-row index.
 return String(item.index);
}
