/** Municipal school calendar reminders are independent of the AI PDF plan.
 * One per school/date, even when multiple children attend the same school.
 */
import {DAYS,dayDate} from './calendar.mjs';
import {schoolDayIndices} from './family-core.mjs';
import {siteConfig} from '../site-config.mjs';

const datePattern=/^\d{4}-\d{2}-\d{2}$/u;
export function calendarHighlights({profiles,calendars,calendar,focus='week'}){
 if(!Array.isArray(profiles)||!calendars||!calendar)return [];
 const {today,next}=schoolDayIndices(calendar);
 const from=calendar.upcoming||focus==='week'?dayDate(calendar.year,calendar.week,0):
  focus==='today'?today<0?null:dayDate(calendar.year,calendar.week,today):
  next==null?null:dayDate(calendar.year,calendar.week,next);
 const to=calendar.upcoming||focus==='week'?dayDate(calendar.year,calendar.week,4):
  focus==='today'?from:dayDate(calendar.year,calendar.week,4);
 if(!from||!to)return [];
 const seen=new Set(),items=[];
 for(const profile of profiles){
  if(!siteConfig.schools[profile.school]||seen.has(profile.school))continue;
  seen.add(profile.school);
  const result=calendars.get(profile.school);
  if(!result||result.schoolId!==profile.school||
   result.year!==calendar.year||result.week!==calendar.week||
   !['live','snapshot'].includes(result.sourceStatus))continue;
  for(const event of result.events||[]){
   if(!datePattern.test(event.date)||event.date<from||event.date>to||
    !event.schoolFree&&!event.sfoClosed)continue;
   const day=DAYS.findIndex((_,i)=>dayDate(calendar.year,calendar.week,i)===event.date);
   if(day<0)continue;
   const title=event.schoolFree?String(event.label||'Skolefri'):
    'SFO er stengt';
   const label=DAYS[day]+': '+title;
   items.push({
    id:profile.id,name:siteConfig.schools[profile.school].name,
    schoolId:profile.school,kind:'municipal-calendar',icon:'📅',
    adultImpact:'workday',label,date:event.date,day:DAYS[day],
    sourceType:'municipal',sourceUrl:result.sourceUrl,
    schoolUrl:result.schoolUrl,sourceStatus:result.sourceStatus,
    checkedAt:result.checkedAt,localChangesPossible:true,
    schoolFree:event.schoolFree===true,
    sfoStatus:event.sfoStatus==='closed'?'closed':'unknown',
    priority:-2,dayOrder:day,aiImportance:3
   });
  }
 }
 return items.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'nb'));
}
