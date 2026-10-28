/** Explicit subgroup meeting arrangements, separate from shared daily activities. */
import {groupLabel} from '../public/shared/group-scope.mjs';
const days=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
const norm=s=>String(s||'').toLocaleLowerCase('nb-NO').replace(/\s+/g,' ').trim();
const timeRx=/\b(?:kl\.?\s*)?([01]?\d|2[0-3])[.:]([0-5]\d)\b/g;
function timeCode(value){
 const match=[...norm(value).matchAll(timeRx)];
 if(match.length!==1)return null;
 return `${String(Number(match[0][1])).padStart(2,'0')}:${match[0][2]}`;
}
function hasOwnAppointment(text,group,time,day){
 // A PDF page/AI quote can mention several groups and several times. Treat
 // each sentence/semicolon clause as a separate instruction; a time from
 // another clause must never attach to this group's appointment.
 const groupName=norm(group);
 const selectedDay=norm(day);
 const clauses=String(text).split(/;|\.(?=\s+[A-ZÆØÅ])|\n/).map(norm);
 return clauses.some(clause=>{
  const nameAt=clause.indexOf(groupName);
  if(nameAt<0||!/(?:oppmøte|møt(?:er|e)?|samles|kommer|oppstart|frammøte)/i.test(clause))return false;
  const times=[...clause.matchAll(timeRx)]
   .filter(m=>`${String(Number(m[1])).padStart(2,'0')}:${m[2]}`===time);
  if(!times.some(m=>Math.abs(m.index-nameAt)<120))return false;
  // If this sentence includes one or more weekdays, it must name the
  // selected day. A weekday in a separate sentence is not sufficient.
  const mentioned=days.filter(d=>new RegExp(`(?:^| )${norm(d)}(?: |$)`).test(clause));
  return !mentioned.length||mentioned.some(d=>norm(d)===selectedDay);
 });
}
/** Return null rather than invent a subgroup's meeting time from unrelated text. */
export function verifiedAttendance(entry,pageText=''){
 if(!entry||!days.includes(entry.day)||typeof entry.text!=='string'||!entry.text.trim())return null;
 const quote=String(entry.sourceQuote||'');
 const group=groupLabel(entry.group,quote);
 if(!group||!groupLabel(entry.group,pageText))return null;
 const time=timeCode(entry.time);
 if(!group||!time||!pageText)return null;
 if(!hasOwnAppointment(quote,group,time,entry.day))return null;
 // Match the same group, time AND weekday within the source's own instruction.
 if(!hasOwnAppointment(pageText,group,time,entry.day))return null;
 const text=entry.text.replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,300);
 return {day:entry.day,group,time,text};
}
/** A shared activity stays shared even when the quote also describes exceptions. */
export function sharedActivity(title,quote){
 const combined=norm(title+' '+quote);
 return /\b(?:alle|hele trinnet|hele klassen|begge gruppene|begge klassene)\b/.test(combined)
  && /\b(?:svøm(?:ming|me|mer)|gym|tur|undervisning|aktivitet|skal)\b/.test(combined);
}
