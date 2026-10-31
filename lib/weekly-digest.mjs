/** Plain-text, source-grounded Sunday briefing; never infer missing PDF facts. */
import {DAYS,familyWeekCalendar,dayDate} from '../public/shared/calendar.mjs';
import {profileSummary} from '../public/shared/family-core.mjs';
import {practicalHighlights} from '../public/shared/practical-highlights.mjs';
import {calendarHighlights} from '../public/shared/school-calendar-highlights.mjs';
import {adultImpactRank} from '../public/shared/adult-impact.mjs';
import {sourcePdfLink} from '../public/shared/practical-digest.mjs';
import {siteConfig} from '../public/site-config.mjs';
import {renderWeeklyDigestHtml} from './weekly-digest-html.mjs';

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
 const range=formatDay(dayDate(calendar.year,calendar.week,0))+'–'+formatDay(dayDate(calendar.year,calendar.week,4));
 const sections=[];
 const sensitive=/\b(?:vaksin|helse|medisin|diagnos|allergi|personnummer)\w*/iu;
 for(const profile of clean){
  const plan=pairPlans.get(profile.id),raw=plans.get(profile.school+'|'+profile.grade),summary=summaries.get(profile.id);
  // The audit is mandatory for outgoing child-specific details. Keep the plan
  // unavailable if source verification has not completed.
  // A successful audit with zero critical facts is still a successful audit.
  // sourceFacts counts exceptional notices, not homework or daily activities.
  const audited=plan?.sourceAudit?.status==='ok';
  const sourceAttention=plan?.sourceAudit?.status==='attention';
  const safe=x=>String(x||'').replace(/\\s+/gu,' ').trim().slice(0,320);
  const homework=[],gear=[],notices=[];
  if(summary?.ready&&(audited||sourceAttention)){
   const unique=new Set();
   for(const task of summary.tasks||[]){
    const value=safe(task.text||task.title||'');
    if(!value||sensitive.test(value)||(!audited&&task.digestSourceVerified!==true))continue;
    const day=DAYS.includes(task.dueDay)&&(audited||task.digestDeadlineVerified===true)?task.dueDay:'';
    const text=(task.subject?safe(task.subject)+': ':'')+value;
    const key=day+'|'+text;
    if(!unique.has(key)){unique.add(key);homework.push({day,text});}
   }
   const seenGear=new Set();
   for(const item of audited?summary.weeklyBag||[]:[]){
    const text=safe(item.label),day=DAYS.includes(item.day)?item.day:'';
    if(!text||sensitive.test(text)||/^(?:penal|matpakke|drikkeflaske|sekk)$/iu.test(text))continue;
    const key=day+'|'+text;
    if(!seenGear.has(key)){seenGear.add(key);gear.push({day,text});}
   }
   // Reuse the existing source-proven highlights for notices and events.
   for(const item of verified.filter(x=>x.id===profile.id)){
    const pdf=sourcePdfLink(plan.pdf,item.sourcePage);
    if(!pdf||sensitive.test(item.sourceQuote))continue;
    notices.push({day:item.day||'',text:safe(item.sourceQuote)});
   }
  }
  const ready=Boolean(summary?.ready&&(audited||sourceAttention&&homework.length>0));
  const partial=Boolean(ready&&sourceAttention);
  const state=ready?(partial?'partial':'ready'):raw?.status==='unpublished'?'unpublished':
   raw?.status==='unavailable'?'unavailable':
   raw?.aiStatus==='processing'?'processing':
   plan&&!audited?'audit-pending':'pending';
  const reason=state==='unpublished'?'Skolen har foreløpig ikke publisert PDF for uke '+calendar.week+'.':
   state==='unavailable'?'Fant ingen ukeplan på skolens trinnside.':
   state==='processing'?'Ukeplanen er publisert, men AI-behandlingen pågår.':
   state==='audit-pending'?'Ukeplanen er tolket, men kildekontrollen er ikke godkjent.':
   'Ukeplanen er ennå ikke ferdig kontrollert.';
  sections.push({name:profile.name,ready,partial,state,reason,
   auditNote:partial?'En eller flere viktige beskjeder er ikke ferdig verifisert. Se original-PDF-en for fullstendig informasjon.':null,
   homework:homework.slice(0,18),
   gear:gear.slice(0,18),notices:notices.slice(0,12),
   pdf:sourcePdfLink(plan?.pdf||raw?.pdf)||null,
   source:siteConfig.schools[profile.school].grades?.[profile.grade]||null});
 }
 const municipalRows=municipal.slice(0,12).map(item=>
  formatDay(item.date)+': '+excerpt(item.label)+' · '+
  (item.sfoStatus==='closed'?'SFO er bekreftet stengt.':'SFO-status må sjekkes.'));
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
 const missing=sections.filter(p=>!p.ready);
 if(missing.length){
  lines.push('Ikke alle ukeplaner var ferdigtolket ved utsending. Sjekk særlig:',
   ...missing.slice(0,10).map(p=>'• '+p.name),'');
 }
 const notAudited=clean.filter(p=>pairPlans.has(p.id)&&
  pairPlans.get(p.id)?.sourceAudit?.status!=='ok');
 if(notAudited.length)
  lines.push('Enkelte PDF-beskjeder er utelatt fordi originalkilden ikke er tilstrekkelig verifisert. Sjekk skolens PDF direkte.','');
 for(const section of sections){
  lines.push('',section.name,section.ready?(section.auditNote||''):section.reason);
  if(!section.ready)continue;
  for(const [heading,entries] of [['Lekser og frister',section.homework],
   ['Husk å ta med',section.gear],['Beskjeder og aktiviteter',section.notices]]){
   lines.push(heading+':',...(entries.length?entries.map(x=>
    '• '+(x.day?x.day+': ':'')+x.text):['• Ingen registrerte punkter.']),'');
  }
 }
 if(health?.stale||['changed','unavailable','not_monitored'].includes(health?.status))
  lines.push('NB: Skolerutekilden var ikke nylig verifisert. Sjekk kommunen eller skolen direkte.','');
 lines.push('Skolens originale ukeplan og lokale beskjeder har alltid forrang ved avvik.',
  'Åpne Skoleuka: https://skoleuka.no/',
  '',
  'Du får denne e-posten fordi du selv valgte søndagsoppsummering i familiekontoen.',
  'For å slå den av: Logg inn på skoleuka.no → Min konto → Søndagsoppsummering.');
 const digest={subject:'Skoleuka: uke '+calendar.week+' – lekser, utstyr og beskjeder',
  text:lines.join('\n'),week:calendar.week,year:calendar.year,range,sections,
  municipal:municipalRows,readyPlans:sections.filter(p=>p.ready).length,
  municipalCount:municipal.length,
  verifiedPdfCount:verified.length,missingPlans:missing.length};
 return {...digest,html:renderWeeklyDigestHtml(digest)};
}
