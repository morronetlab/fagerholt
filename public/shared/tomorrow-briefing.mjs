/** Exact next-calendar-day briefing for parents.
 * "Tomorrow" is never replaced by "next school day". The displayed school
 * week can roll forward on Friday afternoon, but family activities may still
 * occur this weekend. Those activities are looked up by the actual ISO date.
 *
 * No school event or homework due-date is ever invented when a source is missing.
 */
import {DAYS,dayDate,schoolCalendar} from './calendar.mjs';
import {activityOccurrences,activityScopeLabel,activityTimeLabel} from './family-activities.mjs';

export function nextIsoDate(today){
 if(typeof today!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(today))return null;
 const d=new Date(today+'T12:00:00Z');
 if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==today)return null;
 d.setUTCDate(d.getUTCDate()+1);
 return d.toISOString().slice(0,10);
}
export function buildTomorrowBriefing({
 actualToday,calendar,agenda,profiles=[],summaries=new Map(),activities=[]
}={}){
 const date=nextIsoDate(actualToday);
 if(!date||!calendar)return {date:null,label:'I morgen',items:[],inDisplayedWeek:false,
  hasMissing:true,notice:'Datoen kunne ikke leses.'};
 const timestamp=new Date(date+'T12:00:00Z');
 const target=schoolCalendar(timestamp,'UTC');
 const weekday=(timestamp.getUTCDay()+6)%7;
 const weekend=weekday>=5;
 const inDisplayedWeek=dayDate(calendar.year,calendar.week,0)<=date&&
  date<=dayDate(calendar.year,calendar.week,6);
 const childIds=new Set(profiles.map(p=>p.id));
 let items=[];
 if(inDisplayedWeek){
  const day=agenda?.days?.find(d=>d.date===date);
  items=(day?.items||[]).map(item=>({
   key:item.key,kind:item.kind,title:item.title,scope:item.scope||'',
   checked:item.checked===true,time:item.time||null,
   childId:item.childId||null,source:item.source||null
  }));
  if(!weekend){
   for(const profile of profiles){
    const summary=summaries.get(profile.id);
    if(!summary?.ready)continue;
    const gear=weekday===summary.todayIndex?summary.todayBag:
     weekday===summary.nextIndex?summary.bag:[];
    for(const [i,item] of (gear||[]).entries()){
     if(!item?.label)continue;
     items.push({key:'packing|'+profile.id+'|'+date+'|'+i,
      kind:'packing',title:'Pakk: '+item.label,scope:profile.name,
      checked:item.checked===true,time:null,childId:profile.id,source:null});
    }
   }
  }
 }else{
  // Current family view may have jumped to next week already. Do not use its
  // school plan for a Saturday or Sunday belonging to a different week.
  items=activityOccurrences(activities,target.year,target.week)
   .filter(x=>x.date===date&&(!x.child_id||childIds.has(x.child_id)))
   .map(x=>({key:'activity|'+x.key,kind:'family',title:x.title,
    scope:activityScopeLabel(x,profiles),time:x.start_time||null,
    timeLabel:activityTimeLabel(x),childId:x.child_id||null,
    checked:false,source:null}));
 }
 const rank={municipal:0,school:1,family:2,homework:3,packing:4};
 items.sort((a,b)=>(rank[a.kind]??5)-(rank[b.kind]??5)||
  String(a.time||'99:99').localeCompare(String(b.time||'99:99'))||
  String(a.title).localeCompare(String(b.title),'nb-NO'));
 const missingProfiles=inDisplayedWeek&&!weekend?profiles
  .filter(p=>!summaries.get(p.id)?.ready).map(p=>p.name):[];
 const hasMissing=missingProfiles.length>0||(!inDisplayedWeek&&!weekend);
 const label=new Intl.DateTimeFormat('nb-NO',{timeZone:'UTC',weekday:'long',day:'numeric',
  month:'long'}).format(timestamp);
 const notice=!profiles.length?'Legg til barn for å se morgendagens skoleoppgaver.':
  !inDisplayedWeek?'Viser familieaktiviteter for morgendagen. Skoleplanen på denne siden gjelder en annen uke.':
  missingProfiles.length?'Ukeplanen er ikke klar for '+missingProfiles.join(', ')+'. Flere punkter kan komme.':
  weekend?'Sjekk familiens avtaler. Skolenes eventuelle helgebeskjeder må kontrolleres i originalkilden.':
  !items.length?'Ingen datofestede punkter funnet for i morgen. Sjekk skolens original ved tvil.':'';
 return {date,label,items,inDisplayedWeek,weekend,hasMissing,missingProfiles,notice,
  completed:items.filter(x=>x.checked).length,outstanding:items.filter(x=>!x.checked).length,
  targetWeek:target.week,targetYear:target.year};
}
