/** Plain-text, source-grounded Sunday briefing; never infer missing PDF facts. */
import {familyWeekCalendar,dayDate} from '../public/shared/calendar.mjs';
import {profileSummary} from '../public/shared/family-core.mjs';
import {practicalHighlights} from '../public/shared/practical-highlights.mjs';
import {calendarHighlights} from '../public/shared/school-calendar-highlights.mjs';
import {adultImpactRank} from '../public/shared/adult-impact.mjs';
import {sourcePdfLink} from '../public/shared/practical-digest.mjs';
import {siteConfig} from '../public/site-config.mjs';

const schoolGrade=p=>p.school+'|'+p.grade+(p.group?'|'+p.group:'');
const excerpt=text=>String(text||'').replace(/\s+/gu,' ').trim().slice(0,320);
const sourceUrl=url=>{try{const u=new URL(url);return u.protocol==='https:'?u.href:null;}catch{return null;}};
const formatDay=date=>new Date(date+'T12:00:00Z').toLocaleDateString('nb-NO',{
 timeZone:'UTC',weekday:'long',day:'numeric',month:'long'});
export function nextSundayDigestWeek(now=new Date()){
 const current=familyWeekCalendar(now,'Europe/Oslo');
 // Do not send email for a past or current school week.
 return {year:current.year,week:current.week,today:dayDate(current.year,current.week,0),
  weekday:0,upcoming:true};
}
/** Only the school's verified public fragments may enter an email. */
export function buildWeeklyDigest({profiles=[],plans=new Map(),calendars=new Map(),
 health=null,now=new Date()}={}){
 const calendar=nextSundayDigestWeek(now),label='Uke '+calendar.week+' ('+
  formatDay(dayDate(calendar.year,calendar.week,0))+'–'+
  formatDay(dayDate(calendar.year,calendar.week,4))+')';
 const clean=[];
 const seen=new Set();
 for(const profile of profiles){
  if(!siteConfig.schools[profile.school]||!/^[1-7](?:[A-F])?$/u.test(profile.grade))continue;
  const key=schoolGrade(profile);
  if(seen.has(key))continue;seen.add(key);
  clean.push({id:key,name:siteConfig.schools[profile.school].name+' · '+profile.grade+'. trinn',
   school:profile.school,grade:profile.grade,group:profile.group||''});
 }
 const summaries=new Map(),pairPlans=new Map();
 for(const profile of clean){
  const plan=plans.get(profile.school+'|'+profile.grade);
  if(plan?.status==='ok'&&plan?.parser==='ai'&&plan?.aiStatus==='ready'&&
     plan.year===calendar.year&&plan.week===calendar.week){
   pairPlans.set(profile.id,plan);
   summaries.set(profile.id,profileSummary(profile,plan,calendar,()=>null));
  }
 }
 const municipal=calendarHighlights({profiles:clean,calendars,calendar,focus:'week'});
 const verified=practicalHighlights({
  profiles:clean,summaries,plans:pairPlans,calendar,focus:'week'})
  .filter(item=>{
   const audit=pairPlans.get(item.id)?.sourceAudit;
   return audit?.status==='ok'&&audit.sourceFacts>0&&
    typeof item.sourceQuote==='string'&&item.sourceQuote.trim().length>=16;
  })
  .sort((a,b)=>adultImpactRank(b.label)-adultImpactRank(a.label)||a.priority-b.priority)
  .slice(0,7);
 const lines=['Skoleuka · '+label,'','Praktisk informasjon fra skolene:',''];
 let count=0;
 for(const item of municipal.slice(0,12)){
  const source=sourceUrl(item.sourceUrl);
  const sfo=item.sfoStatus==='closed'?'SFO er bekreftet stengt.':
   'SFO-status er ikke bekreftet – sjekk skolen/SFO.';
  lines.push('• '+formatDay(item.date)+': '+excerpt(item.label.replace(/^[^:]+:\s*/u,'')),
   '  '+(item.schoolFree?'Elevene har fri. ':'')+sfo,
   '  '+(item.sourceStatus==='snapshot'?
    'Kommunal reserveversjon (sist kontrollert '+(item.checkedAt||'ukjent dato')+').':
    'Kommunens skolerute.')+(item.localChangesPossible?' Lokale avvik kan forekomme.':''),
   ...(source?['  Kilde: '+source]:[]),'');
  count++;
 }
 for(const item of verified){
  const plan=pairPlans.get(item.id);
  const pdf=plan&&sourcePdfLink(plan.pdf,item.sourcePage);
  if(!pdf)continue;
  lines.push('• '+item.name+': '+excerpt(item.sourceQuote),
   '  Original PDF: '+pdf,'');
  count++;
 }
 if(count===0)lines.push('Ingen bekreftede særskilte beskjeder ble funnet for denne uka.','');
 const missing=clean.filter(p=>!pairPlans.has(p.id));
 if(missing.length){
  lines.push('Ikke alle ukeplaner var ferdigtolket ved utsending. Sjekk særlig:',
   ...missing.slice(0,10).map(p=>'• '+p.name),'');
 }
 const notAudited=clean.filter(p=>pairPlans.has(p.id)&&
  (pairPlans.get(p.id)?.sourceAudit?.status!=='ok'||!
   pairPlans.get(p.id)?.sourceAudit?.sourceFacts));
 if(notAudited.length)
  lines.push('Enkelte PDF-beskjeder er utelatt fordi originalkilden ikke er tilstrekkelig verifisert. Sjekk skolens PDF direkte.','');
 if(health?.stale||['changed','unavailable','not_monitored'].includes(health?.status))
  lines.push('NB: Skolerutekilden var ikke nylig verifisert. Sjekk kommunen eller skolen direkte.','');
 lines.push('Skolens originale ukeplan og lokale beskjeder har alltid forrang ved avvik.',
  'Åpne Skoleuka: https://skoleuka.no/',
  '',
  'Du får denne e-posten fordi du selv valgte søndagsoppsummering i familiekontoen.',
  'For å slå den av: Logg inn på skoleuka.no → Min konto → Søndagsoppsummering.');
 return {subject:'Skoleuka: uke '+calendar.week+' – praktiske beskjeder',
  text:lines.join('\n'),week:calendar.week,year:calendar.year,
  municipalCount:municipal.length,verifiedPdfCount:verified.length,missingPlans:missing.length};
}
