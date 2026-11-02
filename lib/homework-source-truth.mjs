/**
 * Canonical homework from an official PDF table, independent of AI cache state.
 * The school document determines deadlines; AI may only contribute tasks outside
 * a verified table. A cache entry is corrected on read as well as on creation.
 */
import {extractHomeworkDeadlineCells,extractUndatedWeeklyHomework} from './homework-grid.mjs';
import {DAYS} from './calendar.mjs';
import {routeHomeworkPieces} from './homework-routing.mjs';
import {extractHomeworkDaySections} from './homework-day-sections.mjs';

export const HOMEWORK_SOURCE_VERSION=3;
// A verified assignment may appear in a horizontal weekday table or in a
// vertical Lekser > Mandag/Tirsdag/... group. Deduplicate actual source cells,
// never the physical day/column that gives the assignment its deadline.
export function extractHomeworkEvidenceCells(pages){
 const sources=[...extractHomeworkDeadlineCells(pages),...extractHomeworkDaySections(pages)];
 const seen=new Set();
 return sources.filter(item=>{
  const key=[item.sourcePage||'',item.dueDay||'',norm(item.subject),norm(item.text)].join('|');
  if(seen.has(key))return false;seen.add(key);return true;
 });
}
const norm=v=>String(v??'').normalize('NFKC').toLocaleLowerCase('nb-NO')
  .replace(/[^a-zæøå0-9]+/g,' ').trim();
const nonHomework=t=>/^(?:leksefri|ingen lekse|fri fra lekser)\b/i.test(String(t||'').trim());
const stop=new Set('jeg du vi dere de det denne dette som skal kan har den hun han til fra over med under på og eller en et i av er å om for så den der slik sine din boka bok'.split(' '));
const words=s=>new Set(norm(s).split(' ').filter(w=>w.length>=3&&!stop.has(w)));

function sameSourceTask(actual,source){
 const a=words(actual?.text),b=words(source?.text);
 const shared=[...a].filter(x=>b.has(x)).length;
 if(shared>=2&&shared/Math.max(1,Math.min(a.size,b.size))>=0.48)return true;
 const subject=norm(actual?.subject),expected=norm(source?.subject);
 // A close source/AI subject match helps with paraphrasing but cannot alone
 // suppress a second, unrelated homework assignment in the same subject.
 return Boolean(subject&&subject===expected&&shared>=2);
}

/** If identical instructions appear in several verified weekday cells,
 * keep one assignment with one checkbox for each actual source day. Do not
 * collapse different tasks, groups or pages just because subjects match. */
function mergeRepeatedCells(items){
 const groups=new Map();
 for(const item of items){
  const key=[item.sourcePage||'',norm(item.subject),norm(item.text),norm(item.group)].join('|');
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(item);
 }
 const output=[];
 for(const rows of groups.values()){
  const weekdays=DAYS.filter(day=>rows.some(row=>row.dueDay===day));
  if(weekdays.length>1 && rows.length===weekdays.length){
   output.push({...rows[0],dueDay:null,repeatDays:weekdays});
  }else output.push(...rows);
 }
 return output;
}

/**
 * Return an unchanged array if no distinct source deadline matrix is found.
 * When present, source-cell tasks are primary; overlapping AI-only tasks are
 * removed, and unrelated AI homework elsewhere in the document is retained.
 */
export function reconcileHomeworkWithPdf(homework,pages){
 const previous=Array.isArray(homework)?homework:[];
 const cells=extractHomeworkEvidenceCells(pages);
 if(!cells.length)return {homework:previous,verified:false};
 const weekly=extractUndatedWeeklyHomework(pages);
 const canonical=[...cells,...weekly]
  // Do not reinsert vaccine/packing fragments that were correctly moved
  // out of homework in the AI and rule-based pipelines.
  .flatMap(cell=>routeHomeworkPieces([cell],row=>row.dueDay)
   .filter(part=>part.kind==='homework')
   .map(part=>({
    subject:cell.subject||null,dueDay:cell.dueDay||null,
    repeatDays:[],text:part.text,
    ...(cell.sourcePage?{sourcePage:cell.sourcePage}:{}),
   })));
 const merged=mergeRepeatedCells(canonical);
 // A trusted AI source citation may scope a task to a named group. PDF text
 // coordinates prove the day but do not independently verify that scope.
 // Keep such tasks (and their existing days) unchanged rather than silently
 // broadcasting the new canonical assignment to every pupil.
 const safeCanonical=merged.filter(cell=>!previous.some(item=>
  item?.group&&sameSourceTask(item,cell)));
 const extras=previous.filter(item=>{
   if(nonHomework(item?.text))return false;
   return Boolean(item?.group)||!safeCanonical.some(cell=>sameSourceTask(item,cell));
 });
 const seen=new Set(),output=[];
 for(const item of [...safeCanonical,...extras]){
  const key=norm(item.subject)+'|'+norm(item.text)+'|'+String(item.dueDay||'');
  if(seen.has(key))continue;
  seen.add(key);output.push(item);
 }
 return {homework:output,verified:true};
}
