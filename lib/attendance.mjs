/** Verify school-group meeting instructions against quoted PDF evidence.
 * Group lists like «rosa og blå gruppe» are expanded only when the SAME
 * source clause ties those groups to the same meeting time and day.
 */
import {groupLabel,groupNamesInText} from '../public/shared/group-scope.mjs';
const days=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
const norm=s=>String(s||'').toLocaleLowerCase('nb-NO').replace(/\s+/g,' ').trim();
const timeRx=/\b(?:kl\.?\s*)?([01]?\d|2[0-3])[.:]([0-5]\d)\b/g;
const meetingRx=/\b(?:oppmøte|oppmøter|møt(?:er|e|es)?|samles|kommer|oppstart|frammøte|skal møte|skal være)\b/i;
const dayNames=days.map(d=>d.toLocaleLowerCase('nb-NO'));
const clauses=text=>String(text||'').split(/;|\n|\.(?=\s+[A-ZÆØÅ])/).map(norm).filter(Boolean);
function timeCode(value){
 const found=[...norm(value).matchAll(timeRx)];
 if(found.length!==1)return null;
 return `${String(Number(found[0][1])).padStart(2,'0')}:${found[0][2]}`;
}
function timeValues(text){
 return [...norm(text).matchAll(timeRx)].map(m=>`${String(Number(m[1])).padStart(2,'0')}:${m[2]}`);
}
function meetingGroups(text,day,time,{pdfText=false}={}){
 const selectedDay=norm(day);
 const found=[];
 for(const clause of clauses(text)){
  if(!meetingRx.test(clause))continue;
  const matches=[...clause.matchAll(timeRx)];
  if(!matches.length)continue;
  // AI quotes must describe a single time; do not permit accidental merging.
  // PDF.js can flatten several table cells into one long clause: inspect a
  // narrow fragment around EACH timestamp rather than rejecting the entire PDF.
  if(matches.length>1&&!pdfText)continue;
  for(let i=0;i<matches.length;i++){
   const m=matches[i];
   const code=`${String(Number(m[1])).padStart(2,'0')}:${m[2]}`;
   if(code!==time)continue;
   const previousEnd=i>0?matches[i-1].index+matches[i-1][0].length:0;
   const fragment=matches.length===1?clause:clause.slice(Math.max(previousEnd,m.index-170),m.index+m[0].length);
   if(!meetingRx.test(fragment))continue;
   const mentioned=dayNames.filter(d=>new RegExp(`(?:^| )${d}(?: |$)`).test(fragment));
   if(mentioned.length&&!mentioned.includes(selectedDay))continue;
   const groups=groupNamesInText(fragment);
   if(groups.length)found.push(groups);
  }
 }
 return found;
}
/** Expand a verified common meeting notice into one record per named group. */
export function verifiedAttendanceEntries(entry,pageText=''){
 if(!entry||!days.includes(entry.day)||typeof entry.text!=='string'||!entry.text.trim()||!pageText)return [];
 const quote=String(entry.sourceQuote||''),time=timeCode(entry.time);
 if(!time)return [];
 const declared=groupNamesInText(entry.group);
 if(!declared.length){
  const single=groupLabel(entry.group,quote);
  if(single)declared.push(single);
 }
 if(!declared.length)return [];
 const fromQuote=meetingGroups(quote,entry.day,time);
 const fromPage=meetingGroups(pageText,entry.day,time,{pdfText:true});
 if(!fromQuote.length||!fromPage.length)return [];
 const found=[];
 for(const groups of fromQuote){
  // A source quote describing another group/time may not authorise this item.
  if(!groups.some(g=>declared.includes(g)))continue;
  for(const group of groups){
   if(fromPage.some(pageGroups=>pageGroups.includes(group))&&!found.includes(group))found.push(group);
  }
 }
 const text=entry.text.replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,300);
 return found.map(group=>({day:entry.day,group,time,text}));
}
/** Compatibility for callers that validate a single explicit group. */
export function verifiedAttendance(entry,pageText=''){
 const found=verifiedAttendanceEntries(entry,pageText);
 const requested=groupLabel(entry?.group,entry?.sourceQuote||'');
 return found.find(x=>x.group===requested)||found[0]||null;
}
/** A shared activity stays shared even when the quote also describes exceptions. */
export function sharedActivity(title,quote){
 const combined=norm(title+' '+quote);
 return /\b(?:alle|hele trinnet|hele klassen|begge gruppene|begge klassene)\b/.test(combined)
  && /\b(?:svøm(?:ming|me|mer)|gym|tur|undervisning|aktivitet|skal)\b/.test(combined);
}
