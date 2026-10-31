/** Family calendar: exceptional school events, announcements and family plans.
 * Homework and packing remain in the per-child plan and are never calendar events.
 * Date-less school notices are not assigned invented weekdays.
 */
import {DAYS,dayDate} from './calendar.mjs';
import {practicalHighlights} from './practical-highlights.mjs';
import {schoolNoticeDate,sourcePdfLink} from './practical-digest.mjs';
import {calendarHighlights} from './school-calendar-highlights.mjs';
import {activityOccurrences,activityScopeLabel,activityTimeLabel} from './family-activities.mjs';
import {siteConfig} from '../site-config.mjs';

const MUNICIPAL_SOURCE='https://www.kristiansand.kommune.no/navigasjon/barnehage-og-skole/skole-og-sfo/skoleruta/';
const fullWeek=calendar=>Array.from({length:7},(_,i)=>dayDate(calendar.year,calendar.week,i));
const weekday=date=>new Intl.DateTimeFormat('nb-NO',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'})
 .format(new Date(date+'T12:00:00Z'));
const trimDay=label=>String(label||'').replace(/^(?:mandag|tirsdag|onsdag|torsdag|fredag)\s*[:–-]\s*/iu,'').trim();
const safeLink=value=>{try{
 const u=new URL(value);
 return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;
}catch{return null;}};
const provenance=(profile,plan,page)=>{
 const pdf=sourcePdfLink(plan?.pdf,page);
 if(pdf)return {name:'Skolens PDF',url:pdf};
 const school=siteConfig.schools[profile.school];
 return {name:'Skolens nettside',url:safeLink(plan?.source)||safeLink(school?.homepage)};
};
const categoryRank={municipal:0,school:1,family:2};
export function buildFamilyWeekAgenda({profiles=[],summaries=new Map(),plans=new Map(),
 calendars=new Map(),activities=[],calendar,childId=''}={}){
 if(!calendar||!Number.isInteger(calendar.year)||!Number.isInteger(calendar.week))
  return {days:[],undated:[],missingProfiles:[],count:0};
 const dates=fullWeek(calendar),range=new Set(dates),profileList=profiles.filter(p=>p&&p.id);
 const chosen=profileList.some(p=>p.id===childId)?childId:'';
 const visible=chosen?profileList.filter(p=>p.id===chosen):profileList;
 const items=[];
 const missingProfiles=[];
 for(const p of visible){
  if(!summaries.get(p.id)?.ready)missingProfiles.push(p.name);
 }
 const selectedPlans=new Map(visible.map(p=>[p.id,plans.get(p.id)]));
 for(const [i,note] of practicalHighlights({profiles:visible,summaries,plans:selectedPlans,
  calendar,focus:'week'}).entries()){
  const p=visible.find(x=>x.id===note.id);
  // Gear is already available in each child's plan and the expanded
  // practical checklist. The calendar represents events, not packing tasks.
  if(!p||note.kind==='gear')continue;
  const date=schoolNoticeDate(note,calendar.year,calendar.week);
  const source=provenance(p,plans.get(p.id),note.sourcePage);
  items.push({key:'practical|'+p.id+'|'+i,kind:'school',date:date&&range.has(date)?date:null,
   title:trimDay(note.label),childId:p.id,scope:p.name,
   details:note.kind==='gear'?'Husk utstyr':note.kind==='event'?'Skoleaktivitet':'Praktisk å huske',
   source,time:null,checked:false,
   important:Boolean(note.adultImpact)});
 }
 for(const [i,item] of calendarHighlights({profiles:visible,calendars,calendar,focus:'week'}).entries()){
  if(!range.has(item.date))continue;
  items.push({key:'municipal|'+item.schoolId+'|'+item.date+'|'+i,kind:'municipal',
   date:item.date,title:trimDay(item.label),childId:null,
   scope:siteConfig.schools[item.schoolId]?.name||item.name,
   details:item.sourceStatus==='snapshot'?
    'Kommunal skolerute · reserveversjon'+(item.checkedAt?' (kontrollert '+item.checkedAt+')':''):
    'Kommunal skolerute · lokale avvik kan forekomme',
   source:{name:'Offisiell skolerute',url:MUNICIPAL_SOURCE},
   time:null,checked:false,important:true});
 }
 for(const event of activityOccurrences(activities,calendar.year,calendar.week)){
  if(event.child_id&&!visible.some(p=>p.id===event.child_id))continue;
  items.push({key:'activity|'+event.key,kind:'family',date:event.date,
   title:event.title,childId:event.child_id||null,
   scope:activityScopeLabel(event,profileList),
   details:[event.location||'',event.responsible?'Ansvarlig: '+event.responsible:'',event.notes||'']
    .filter(Boolean).join(' · '),time:String(event.start_time||'').slice(0,5)||null,
   timeLabel:activityTimeLabel(event),source:null,checked:false,activityId:event.id,
   repeatRule:event.repeat_rule});
 }
 const order=(a,b)=>{
  const rank=(categoryRank[a.kind]??4)-(categoryRank[b.kind]??4);
  // Day-wide school closures and notices appear before family events.
  if(rank)return rank;
  if(a.time&&b.time&&a.time!==b.time)return a.time.localeCompare(b.time);
  return a.title.localeCompare(b.title,'nb-NO');
 };
 const days=dates.map((date,i)=>({date,weekday:i<5?DAYS[i]:i===5?'Lørdag':'Søndag',
  title:weekday(date),items:items.filter(x=>x.date===date).sort(order)}));
 const undated=items.filter(x=>!x.date).sort(order);
 return {days,undated,missingProfiles,count:items.length,selectedChildId:chosen};
}
