/** Source-specific parser for Kristiansand municipality's public skolerute.
 * Read the municipal HTML table, never classify arbitrary website prose as a school day.
 * Only municipal-standard dates; individual schools may publish local deviations.
 */
export const SKOLERUTE_URL='https://www.kristiansand.kommune.no/navigasjon/barnehage-og-skole/skole-og-sfo/skoleruta/';
export const SNAPSHOT_VERIFIED_AT='2026-10-30';
const MONTHS={januar:1,februar:2,mars:3,april:4,mai:5,juni:6,juli:7,august:8,september:9,oktober:10,november:11,desember:12};
const number=(year,month,day)=>String(year)+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
const utcDay=date=>new Date(date+'T12:00:00Z').getUTCDay();
const isWeekday=date=>{const d=utcDay(date);return d!==0&&d!==6;};
const isoPlus=(iso,step)=>{
 const date=new Date(iso+'T12:00:00Z');
 date.setUTCDate(date.getUTCDate()+step);
 return date.toISOString().slice(0,10);
};
function dateRange(start,end){
 if(!start||!end||start>end)return [];
 const out=[];
 for(let day=start;day<=end&&out.length<400;day=isoPlus(day,1))if(isWeekday(day))out.push(day);
 return out;
}
function decode(value){
 return String(value||'').replace(/&#(\d+);/gu,(_,dec)=>String.fromCodePoint(Number(dec)))
  .replace(/&(?:nbsp|amp|lt|gt|quot|apos|aring|oslash|aelig);/giu,code=>({
   '&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",
   '&aring;':'å','&oslash;':'ø','&aelig;':'æ'
  })[code.toLowerCase()]||' ');
}
const text=value=>decode(value).replace(/<[^>]*>/gu,' ').replace(/\s+/gu,' ').trim();
const normalize=value=>text(value).toLocaleLowerCase('nb-NO');
export const SNAPSHOT_2026_27=Object.freeze([
 ['August','13.','Skolestart'],
 ['September','28.-30.','Høstferie uke 40'],
 ['Oktober','1.-2.','Høstferie uke 40'],
 ['November','6.','Fridag (Sørlandsk lærerstevne)'],
 ['Desember','21.','Juleferie'],
 ['Januar','5.','Skolestart'],
 ['Februar','22.-26.','Vinterferie uke 8'],
 ['Mars','22.-30.','Påskeferie'],
 ['Mai','1.','Arbeidernes dag'],
 ['Mai','6.','Kristi himmelfartsdag'],
 ['Mai','7.','Fridag'],
 ['Mai','17.','Andre pinsedag og grunnlovsdag'],
 ['Juni','18.','Siste skoledag']
]);
const SNAPSHOT_SFO={year:2026,summerYear:2027,weekStart:27,weekEnd:30};
function parseRawRows(markup){
 const rows=[];
 for(const [,inside] of markup.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/giu)){
  const cols=[...inside.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]\s*>/giu)].map(x=>text(x[1]));
  if(cols.length>=3)rows.push(cols.slice(0,3));
 }
 return rows;
}
/** Parse the official year header, its next table, and SFO prose after that table. */
export function parseMunicipalYearHtml(html,startYear){
 if(typeof html!=='string'||html.length<500||html.length>3_000_000)return null;
 const yearLabel=String(startYear)+'[-–\\s]*'+String(startYear+1);
 const heading=new RegExp('<h[1-6]\\b[^>]*>\\s*(?:<[^>]+>\\s*)*skoleruta\\s+'+yearLabel+'(?:\\s*<[^>]+>)*\\s*<\\/h[1-6]\\s*>','iu');
 const match=heading.exec(html);
 if(!match)return null;
 const after=html.slice(match.index+match[0].length);
 const first=after.search(/<table\b/iu);
 if(first<0||first>6000)return null;
 const tableStart=after.slice(first);
 const end=tableStart.search(/<\/table\s*>/iu);
 if(end<0||end>25000)return null;
 const rows=parseRawRows(tableStart.slice(0,end+8));
 const expected=rows.filter(row=>MONTHS[normalize(row[0])]&&/^\d/.test(row[1]));
 if(expected.length<8||!expected.some(r=>/høstferie/iu.test(r[2]))||
  !expected.some(r=>/skolestart/iu.test(r[2])))return null;
 const afterTable=tableStart.slice(end+8,Math.min(end+6000,tableStart.length));
 const nextHeading=afterTable.search(/<h[1-6]\b/iu);
 const extra=text(nextHeading>=0?afterTable.slice(0,nextHeading):afterTable);
 const sfoReg=new RegExp('sfo\\s+er\\s+stengt\\s+julaften\\s+og\\s+nyttårsaften\\s+'+
  startYear+'\\s+og\\s+uke\\s+(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\s+i\\s+'+(startYear+1),'iu');
 const m=extra.match(sfoReg);
 return {rows:expected,
  sfo:m?{year:startYear,summerYear:startYear+1,weekStart:Number(m[1]),weekEnd:Number(m[2])}:null,
  origin:'live'};
}
function rowDate(year,month,raw){
 const match=String(raw).match(/^\s*(\d{1,2})\s*\.\s*(?:[-–]\s*(\d{1,2})\s*\.)?/u);
 if(!match)return null;
 const a=Number(match[1]),b=Number(match[2]||match[1]);
 const valid=day=>day>=1&&day<=new Date(Date.UTC(year,month,0)).getUTCDate();
 if(!valid(a)||!valid(b)||b<a)return null;
 return [number(year,month,a),number(year,month,b)];
}
const weekInYear=(iso)=>{
 const d=new Date(iso+'T12:00:00Z'),day=(d.getUTCDay()+6)%7;
 const thu=new Date(d);thu.setUTCDate(thu.getUTCDate()-day+3);
 const jan4=new Date(Date.UTC(thu.getUTCFullYear(),0,4));
 const week1=new Date(jan4);week1.setUTCDate(jan4.getUTCDate()-(jan4.getUTCDay()+6)%7);
 const monday=new Date(d);monday.setUTCDate(monday.getUTCDate()-day);
 return Math.round((monday-week1)/604800000)+1;
};
/** Expand only explicit municipality rows; school days and SFO are independent. */
export function municipalDatesForYear({rows,sfo},startYear){
 if(!Array.isArray(rows)||!Number.isInteger(startYear))return [];
 const events=new Map(),markers={};
 let lastMonth=0;
 const put=(date,kind,label)=>{
  if(!isWeekday(date))return;
  let item=events.get(date);
  if(!item){item={date,schoolFree:false,sfoClosed:false,label:'',reason:''};events.set(date,item);}
  if(kind==='school'){item.schoolFree=true;item.label=label;item.reason='kommunal skolerute';}
  if(kind==='sfo')item.sfoClosed=true;
 };
 for(const [monthLabel,rawDate,rawNote] of rows){
  const current=MONTHS[normalize(monthLabel)]||lastMonth;
  if(!current)continue;
  lastMonth=current;
  const year=current>=8?startYear:startYear+1;
  const dates=rowDate(year,current,rawDate);
  if(!dates)continue;
  const note=normalize(rawNote);
  if(/skolestart/u.test(note)){
   if(current===1)markers.januaryStart=dates[0];
   if(current===8)markers.augustStart=dates[0];
   continue;
  }
  if(/siste skoledag/u.test(note)){markers.summerEnd=dates[0];continue;}
  if(/juleferie/u.test(note)){markers.christmasStart=dates[0];continue;}
  if(/(?:høstferie|vinterferie|påskeferie|fridag|arbeidernes dag|himmelfartsdag|pinsedag|grunnlovsdag)/u.test(note)){
   for(const day of dateRange(dates[0],dates[1]))put(day,'school',rawNote);
  }
 }
 if(markers.christmasStart&&markers.januaryStart){
  for(const day of dateRange(markers.christmasStart,isoPlus(markers.januaryStart,-1)))
   put(day,'school','Juleferie');
 }
 // First day after the final summer term is shown only when the next school
 // year's start has also been established from the municipality website.
 if(markers.summerEnd&&sfo?.nextSchoolStart){
  for(const day of dateRange(isoPlus(markers.summerEnd,1),isoPlus(sfo.nextSchoolStart,-1)))
   put(day,'school','Sommerferie');
 }
 if(sfo?.year===startYear&&sfo.summerYear===startYear+1&&
  sfo.weekStart>=1&&sfo.weekEnd<=53&&sfo.weekEnd>=sfo.weekStart){
  for(let day=number(startYear+1,6,20);day<=number(startYear+1,9,1);day=isoPlus(day,1)){
   if(weekInYear(day)>=sfo.weekStart&&weekInYear(day)<=sfo.weekEnd)
    put(day,'sfo','SFO stengt (sommer)');
  }
  for(const day of [number(startYear,12,24),number(startYear,12,31)])put(day,'sfo','SFO stengt');
 }
 return [...events.values()].sort((a,b)=>a.date.localeCompare(b.date))
  .map(x=>({...x,
   label:x.schoolFree?x.label:'SFO stengt',
   sfoStatus:x.sfoClosed?'closed':'unknown'}));
}
export function officialSnapshot(startYear){
 if(startYear!==2026)return null;
 return {rows:SNAPSHOT_2026_27.map(row=>[...row]),
  sfo:{...SNAPSHOT_SFO},origin:'snapshot',verifiedAt:SNAPSHOT_VERIFIED_AT};
}
