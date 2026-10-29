/**
 * Canonical homework from an official PDF table, independent of AI cache state.
 * The school document determines deadlines; AI may only contribute tasks outside
 * a verified table. A cache entry is corrected on read as well as on creation.
 */
import {extractHomeworkDeadlineCells,extractUndatedWeeklyHomework} from './homework-grid.mjs';

export const HOMEWORK_SOURCE_VERSION=1;
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

/**
 * Return an unchanged array if no distinct source deadline matrix is found.
 * When present, source-cell tasks are primary; overlapping AI-only tasks are
 * removed, and unrelated AI homework elsewhere in the document is retained.
 */
export function reconcileHomeworkWithPdf(homework,pages){
 const previous=Array.isArray(homework)?homework:[];
 const cells=extractHomeworkDeadlineCells(pages);
 if(!cells.length)return {homework:previous,verified:false};
 const weekly=extractUndatedWeeklyHomework(pages);
 const canonical=[...cells,...weekly].map(cell=>({
   subject:cell.subject||null,dueDay:cell.dueDay||null,
   repeatDays:[],text:cell.text,
   ...(cell.sourcePage?{sourcePage:cell.sourcePage}:{}),
 }));
 const extras=previous.filter(item=>{
   if(nonHomework(item?.text))return false;
   return !canonical.some(cell=>sameSourceTask(item,cell));
 });
 const seen=new Set(),output=[];
 for(const item of [...canonical,...extras]){
  const key=norm(item.subject)+'|'+norm(item.text)+'|'+String(item.dueDay||'');
  if(seen.has(key))continue;
  seen.add(key);output.push(item);
 }
 return {homework:output,verified:true};
}
