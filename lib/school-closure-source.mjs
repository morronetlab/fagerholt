/**
 * Source-backed school-closure evidence for the rules/fallback PDF reader.
 *
 * Do not infer closures from timetable labels alone or from general holidays.
 * This reader requires an explicit school-closure/planning-day statement AND
 * named weekdays. A dated weekday must match the requested ISO school week;
 * a future date printed in last week's newsletter is only a future notice.
 */
import {DAYS,dayDate} from './calendar.mjs';

const months=new Map([
 ['januar',1],['februar',2],['mars',3],['april',4],['mai',5],
 ['juni',6],['juli',7],['august',8],['september',9],
 ['oktober',10],['november',11],['desember',12]
]);
const closurePattern=/\b(?:planleggingsdag(?:er)?|skolen\s+(?:er\s+)?stengt)\b/giu;
const weekdayPattern=/\b(mandag|tirsdag|onsdag|torsdag|fredag)\b/giu;
const datedWeekday=/\b(mandag|tirsdag|onsdag|torsdag|fredag)\s+([0-3]?\d)\s*\.?\s*(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)(?:\s+(20\d{2}))?\b/giu;
const numberDate=/\b(mandag|tirsdag|onsdag|torsdag|fredag)\s+([0-3]?\d)[./-]([01]?\d)(?:[./-](20\d{2}))?(?!\d)/giu;
const clean=s=>String(s||'').normalize('NFKC').replace(/[\u0000-\u001f\u00ad]/g,' ').replace(/\s+/g,' ').trim();
const capital=s=>DAYS.find(d=>d.toLowerCase()===String(s).toLocaleLowerCase('nb-NO'));
const isoDate=(year,month,day)=>{
 if(!Number.isInteger(year)||month<1||month>12||day<1||day>31)return null;
 const d=new Date(Date.UTC(year,month-1,day));
 return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day?
  d.toISOString().slice(0,10):null;
};
const unique=items=>[...new Map(items.map(x=>[x.day,x])).values()];

function evidenceForMatch(text,match,sourcePage,year,week){
 const before=text.slice(Math.max(0,match.index-115),match.index);
 const after=text.slice(match.index+match[0].length,match.index+match[0].length+110);
 const lead=before.slice(-55).toLocaleLowerCase('nb-NO');
 const tail=after.slice(0,45).toLocaleLowerCase('nb-NO');
 // Explicitly negated/cancelled or historical notices are NOT school closures.
 if(/\b(?:ikke|ingen|avlyst|utsatt)\s*$/u.test(lead)||
  /^\s*(?:er\s+)?(?:avlyst|avlyste|ikke\s+aktuell)/u.test(tail)||
  /\bforrige\s+uke\b/u.test(lead))return null;

 const context=before+match[0]+after;
 const rawNumeric=[...context.matchAll(numberDate)];
 const rawWritten=[...context.matchAll(datedWeekday)];
 const hasExplicitDate=rawNumeric.length>0||rawWritten.length>0;
 const numeric=rawNumeric.map(m=>({
  day:capital(m[1]),date:isoDate(m[4]?Number(m[4]):year,Number(m[3]),Number(m[2])),
  dayNumber:Number(m[2]),month:Number(m[3]),explicitYear:m[4]?Number(m[4]):null
 })).filter(x=>x.day&&x.date);
 const written=rawWritten.map(m=>({
  day:capital(m[1]),date:isoDate(m[4]?Number(m[4]):year,months.get(m[3].toLowerCase()),Number(m[2])),
  dayNumber:Number(m[2]),month:months.get(m[3].toLowerCase()),explicitYear:m[4]?Number(m[4]):null
 })).filter(x=>x.day&&x.date);
 // Date evidence is stronger than merely spotting a weekday elsewhere on the
 // page. This is crucial for Fagerholt week 44 -> closures November 5–6, week 45.
 const dated=unique([...numeric,...written]);
 const afterDays=[...after.matchAll(weekdayPattern)].map(m=>capital(m[1])).filter(Boolean);
 const beforeDays=[...before.matchAll(weekdayPattern)].map(m=>capital(m[1])).filter(Boolean);
 const hasDirectAfter=afterDays.some(day=>new RegExp('^.{0,65}\\b'+day+'\\b','iu').test(after));
 // A preceding weekday is trusted only if paired with its actual printed date.
 // 'Planleggingsdag' alone in a timetable cell must not close arbitrary days.
 if(!hasDirectAfter&&!dated.length)return null;
 // A table cell labelled only 'Planleggingsdag' can be adjacent to a
 // different weekday column. Fagerholt's dated prose explicitly says closed.
 if(!hasDirectAfter&&/\bplanleggingsdag\b/iu.test(match[0])&&
  !/\bstengt\b/iu.test(after.slice(0,70)))return null;
 // An invalid printed date is NOT permission to pretend there is no date.
 const mentioned=hasExplicitDate?dated.map(x=>x.day):afterDays;
 const days=DAYS.filter(day=>mentioned.includes(day));
 if(!days.length)return null;
 const datedByDay=new Map(dated.map(x=>[x.day,x]));
 const referNextWeek=/\b(?:neste|kommende)\s+uke\b/iu.test(lead)||/\buken\s+etter\b/iu.test(lead);
 const closedDays=days.filter(day=>{
  if(referNextWeek)return false;
  if(dated.length)return datedByDay.get(day)?.date===dayDate(year,week,DAYS.indexOf(day));
  return true;
 });
 const type=/planleggingsdag/iu.test(match[0])?'planning':'school-closed';
 const title=type==='planning'?'Planleggingsdager':'Skolen stengt';
 const names=days.map(day=>{
  const at=datedByDay.get(day);
  if(!at)return day.toLowerCase();
  const month=[...months.entries()].find(([,n])=>n===at.month)?.[0]||'';
  return day.toLowerCase()+' '+at.dayNumber+'. '+month+(at.explicitYear?' '+at.explicitYear:'');
 });
 const noticeText=(referNextWeek?'Neste uke: ':'')+title+' '+names.join(' og ');
 return {type,sourcePage,noticeText,closedDays};
}

/**
 * Result is just evidence from the original PDF.js text layer:
 * [{noticeText,closedDays,sourcePage,type}]. No calls to AI or outside data.
 */
export function extractSchoolClosuresFromPdf(pages,year,week){
 if(!Number.isInteger(year)||!Number.isInteger(week)||week<1||week>53)return [];
 const findings=[],seen=new Set();
 for(const [pageIndex,page] of (Array.isArray(pages)?pages:[]).entries()){
  const text=clean((page?.items||[]).map(item=>item?.text).filter(Boolean).join(' '));
  for(const match of text.matchAll(closurePattern)){
   const found=evidenceForMatch(text,match,pageIndex+1,year,week);
   if(!found)continue;
   const key=found.type+'|'+found.noticeText.toLocaleLowerCase('nb-NO');
   if(seen.has(key))continue;
   seen.add(key);
   findings.push(found);
  }
 }
 return findings;
}
