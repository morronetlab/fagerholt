/** Shared family calendar events. No dependency on PDF parsing or server state.
 * All recurrence arithmetic is performed on ISO calendar days in UTC; times are
 * local wall-clock values and are never converted across DST boundaries.
 */
import {dayDate} from './calendar.mjs';

const ISO=/^\d{4}-\d{2}-\d{2}$/u;
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/u;
export const FAMILY_ACTIVITY_MAX=150;
const short=(value,max)=>String(value??'').trim().replace(/\s+/gu,' ').slice(0,max+1);
export function validIsoDate(s){
 if(typeof s!=='string'||!ISO.test(s))return false;
 const d=new Date(s+'T12:00:00Z');
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s&&
  s>='2020-01-01'&&s<='2100-12-31';
}
export function normalizeActivityDraft(values,childIds=[]){
 const title=short(values?.title,120);
 if(!title||title.length>120)throw Error('Aktiviteten må ha en tittel på maks 120 tegn.');
 const occurs_on=values?.occurs_on;
 if(!validIsoDate(occurs_on))throw Error('Velg en gyldig dato.');
 const repeat_rule=values?.repeat_rule||'none';
 if(!['none','weekly'].includes(repeat_rule))throw Error('Ugyldig gjentakelse.');
 const repeat_until=repeat_rule==='weekly'&&values?.repeat_until?values.repeat_until:null;
 if(repeat_until&&(!validIsoDate(repeat_until)||repeat_until<occurs_on))
  throw Error('Sluttdato må være på eller etter startdatoen.');
 const rawStart=String(values?.start_time||'').slice(0,5),
  rawEnd=String(values?.end_time||'').slice(0,5);
 const start_time=rawStart||null,end_time=rawEnd||null;
 if(start_time&&!TIME.test(start_time)||end_time&&(!TIME.test(end_time)||!start_time||end_time<=start_time))
  throw Error('Sjekk klokkeslett. Slutt må være etter start.');
 const child_id=values?.child_id||null;
 if(child_id&&!childIds.includes(child_id))
  throw Error('Velg et barn fra den aktive familien.');
 const location=short(values?.location,120),responsible=short(values?.responsible,80),
  notes=String(values?.notes||'').trim();
 if(location.length>120||responsible.length>80||notes.length>600)
  throw Error('Sted, ansvarlig eller merknad er for lang.');
 return {title,child_id,occurs_on,start_time,end_time,repeat_rule,repeat_until,
  location,responsible,notes};
}
const epoch=date=>new Date(date+'T12:00:00Z').getTime();
const DAY=86400000;
export function familyActivityWeekDates(year,week){
 return {start:dayDate(year,week,0),end:dayDate(year,week,6)};
}
export function activityOccurrences(rows,year,week){
 const {start,end}=familyActivityWeekDates(year,week),events=[];
 for(const row of (Array.isArray(rows)?rows:[]).slice(0,FAMILY_ACTIVITY_MAX)){
  if(!validIsoDate(row.occurs_on)||!['none','weekly'].includes(row.repeat_rule)||
   !row.title||!row.id)continue;
  if(row.repeat_rule==='none'){
   if(row.occurs_on>=start&&row.occurs_on<=end)
    events.push({...row,date:row.occurs_on,key:row.id+'|'+row.occurs_on});
   continue;
  }
  if(row.occurs_on>end||row.repeat_until&&row.repeat_until<start)continue;
  const base=epoch(row.occurs_on);
  for(let d=0;d<7;d++){
   const date=dayDate(year,week,d);
   if(date<row.occurs_on||row.repeat_until&&date>row.repeat_until)continue;
   if(Math.round((epoch(date)-base)/DAY)%7!==0)continue;
   events.push({...row,date,key:row.id+'|'+date});
  }
 }
 return events.sort((a,b)=>a.date.localeCompare(b.date)||
  String(a.start_time||'99:99').localeCompare(String(b.start_time||'99:99'))||
  a.title.localeCompare(b.title,'nb-NO'));
}
export function activityDayLabel(date){
 if(!validIsoDate(date))return '';
 const d=new Date(date+'T12:00:00Z');
 return new Intl.DateTimeFormat('nb-NO',{timeZone:'UTC',weekday:'long',day:'numeric',
  month:'short'}).format(d);
}
export function activityTimeLabel(row){
 const start=String(row.start_time||'').slice(0,5),end=String(row.end_time||'').slice(0,5);
 return start?start+(end?'–'+end:''):'Ingen klokkeslett';
}
export function activityScopeLabel(row,profiles){
 return row.child_id?profiles.find(p=>p.id===row.child_id)?.name||'Barn som ikke er tilgjengelig':
  'Hele familien';
}
