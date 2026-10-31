/** Device-local family UI; one source-grounded weekly plan per class. */
import {siteConfig} from './site-config.mjs';
import {initChildPairingUI} from './child-pairing-ui.mjs';
import {activityOccurrences} from './shared/family-activities.mjs';
import {initFamilyActivitiesUI} from './family-activities-ui.mjs';
import {familyWeekCalendar,DAYS} from './shared/calendar.mjs';
import {FAMILY_STORAGE_KEY,FAMILY_MAX_PROFILES,readFamily,familyDocument,putProfile,profileSummary,
 familyHighlights,schoolDayIndices,childProgressKey} from './shared/family-core.mjs';
import {quizItems,buildQuizRounds} from './shared/word-quiz-core.mjs';
import {practiceKey,restorePractice,practiceSummary} from './shared/word-practice-core.mjs';
import {taskFingerprint} from './shared/cloud-account.mjs';
import {packingFingerprint} from './shared/packing-fingerprint.mjs';
import {scopedPackingItems} from './barn/child-learning.mjs';
import {contentCategoryLabel} from './shared/content-categories.mjs';
import {expandHomework} from './shared/homework-view.mjs';
import {practicalHighlights} from './shared/practical-highlights.mjs';
import {priorityKey,applyPracticalPriority} from './shared/practical-priority.mjs';
import {practicalDigest} from './shared/practical-digest.mjs';
import {calendarHighlights} from './shared/school-calendar-highlights.mjs';
import {buildFamilyWeekAgenda} from './shared/family-week-agenda.mjs';
import {focusedFamilyCalendar} from './shared/family-calendar-viewport.mjs';
import {initFamilyMobileUI} from './family-mobile.mjs';
import {familyAgendaMarkup,familyAgendaItemHtml} from './shared/family-week-agenda-html.mjs';
import {importantFamilyNotices} from './shared/family-important-notices.mjs';
import {FAMILY_OVERVIEW_BATCH_MS,holdInitialHighlights,readCalendarCache,storeCalendarCache,cacheableCalendar,stableHighlightOrder,highlightIdentity} from './shared/family-overview-load.mjs';

const el=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=k=>{try{return localStorage.getItem(k);}catch{return null;}};
const write=(k,v)=>{try{localStorage.setItem(k,v);return true;}catch{return false;}};
const getJson=async(url,timeout=40000)=>{
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),timeout);
 try{const response=await fetch(url,{signal:abort.signal});
  if(!response.ok)throw Error('Skoledata utilgjengelig ('+response.status+').');
  return response.json();
 }finally{clearTimeout(timer);}
};
function wordStatus(profile,plan,calendar){
 if(!plan?.vocabulary)return null;
 const items=quizItems(plan.vocabulary);
 let total=0,attempted=0,weak=0;
 for(const language of ['en','nb']){
  const rounds=buildQuizRounds(items,language);
  if(!rounds.length)continue;
  const key=practiceKey({school:profile.school,grade:profile.grade,year:calendar.year,
   week:calendar.week,childId:profile.id},language,items);
  const progress=practiceSummary(restorePractice(read(key),rounds),rounds);
  total+=progress.total;attempted+=progress.done;weak+=progress.weak;
 }
 return total?{total,attempted,weak}:null;
}
export function initFamilyUI({onModeChange,onOpenProfile,onOpenSingle,onReportIssue}){
 let active=false,profiles=readFamily(read(FAMILY_STORAGE_KEY),siteConfig.schools);
 const mobileUI=initFamilyMobileUI();
 let mobileMoreOpen=new Set();
 let cloud=null,cloudChecks=new Map(),bagChecks=new Map(),focus='next',lastSynced=null,syncError='';
 const plans=new Map(),loading=new Set(),errors=new Map();
 // Public municipal dates are independent of individual PDF availability.
 const calendars=new Map(),calendarFetchAt=new Map(),calendarInFlight=new Set();
 const calendarStage=new Map();
 // Keep child cards interactive while briefly batching first reminders paint.
 let overviewBatch=null,overviewTimer=null,lastReminderOrder=null;
 const previousHtml=new Map();
 const setHtml=(id,markup)=>{
  if(previousHtml.get(id)===markup)return;
  el(id).innerHTML=markup;previousHtml.set(id,markup);
 };
 const clearOverviewTimer=()=>{if(overviewTimer)clearTimeout(overviewTimer);overviewTimer=null;};
 function releaseOverviewIfReady(){
  if(!overviewBatch||overviewBatch.pairs.size)return;
  const cal=calendar();
  if(overviewBatch.schools.some(s=>!cacheableCalendar(calendars.get(s),s,cal.year,cal.week)))return;
  clearOverviewTimer();overviewBatch=null;render();
 }
 let sourceHealth=null,sourceHealthFetchedAt=0,sourceHealthBusy=false;
 // Poll one server-side AI job per unique school/grade, not once per child.
 const pendingJobs=new Map(),pollTimers=new Map(),autoRetries=new Map();
 const priorityStates=new Map(),priorityTimers=new Map();
 let run=0,editing=null,gradeRun=0,lastPlanCheckAt=0,loadedWeekKey=null,showAllHighlights=false;
 let agendaChildId='',showWeekend=false;
 let expandedChildren=new Set();
 let reportCards=[];
 const AUTO_CHECK_MS=15*60_000, RETRY_COOLDOWN_MS=5*60_000+5000;
 const pairOf=p=>p.school+'|'+p.grade;
 const pairProfiles=pair=>profiles.filter(p=>pairOf(p)===pair);
 const pollDelay=attempt=>Math.min(15000,4000+Math.max(0,attempt)*1500);
 function stopPollTimers(){
  for(const timer of pollTimers.values())clearTimeout(timer);
  pollTimers.clear();
  for(const timer of priorityTimers.values())clearTimeout(timer);
  priorityTimers.clear();
 }
 const priorityIdentity=plan=>[plan.pdf,plan.createdAt||'',plan.year,plan.week].join('|');
 function schedulePriority(pair,plan,sequence,delay=4000){
  if(!active||sequence!==run||document.visibilityState==='hidden')return;
  const timer=priorityTimers.get(pair);if(timer)clearTimeout(timer);
  priorityTimers.set(pair,setTimeout(()=>{
   priorityTimers.delete(pair);void fetchPriority(pair,plan,sequence);
  },delay));
 }
 async function fetchPriority(pair,plan,sequence){
  if(!active||sequence!==run||!plan?.practicalPriorityToken)return;
  const identity=priorityIdentity(plan),old=priorityStates.get(pair);
  if(old?.identity!==identity)return;
  let response;
  try{response=await getJson('/api/practical-priority?job='+
    encodeURIComponent(plan.practicalPriorityToken),26000);}
  catch{response={status:'unavailable'};}
  if(!active||sequence!==run||priorityStates.get(pair)?.identity!==identity)return;
  if(response.status==='ready'&&response.scores&&typeof response.scores==='object'){
   priorityStates.set(pair,{identity,status:'ready',scores:response.scores});
   render();
  }else if(response.status==='processing'){
   const attempt=(old.attempt||0)+1;
   priorityStates.set(pair,{identity,status:'processing',attempt});
   if(attempt<8)schedulePriority(pair,plan,sequence,Math.min(10000,3000+attempt*1000));
  }else{
   priorityStates.set(pair,{identity,status:'unavailable'});
  }
 }
 function requestPriority(pair,plan,sequence){
  const old=priorityStates.get(pair),identity=priorityIdentity(plan||{});
  if(plan?.aiStatus!=='ready'||!plan.practicalPriorityToken){
   priorityStates.delete(pair);return;
  }
  if(old?.identity===identity&&old.status==='ready')return;
  if(old?.identity===identity&&priorityTimers.has(pair))return;
  priorityStates.set(pair,{identity,status:'processing',attempt:0});
  void fetchPriority(pair,plan,sequence);
 }

 const calendar=()=>familyWeekCalendar(new Date(),'Europe/Oslo');
 const activityUI=initFamilyActivitiesUI({getProfiles:()=>profiles,getCloud:()=>cloud,getCalendar:calendar,
  onChange:()=>{if(active)render();}});
 const childPairingUI=initChildPairingUI({getCloud:()=>cloud});
 const weekKey=now=>now.year+'-'+String(now.week).padStart(2,'0');
 async function refreshSourceHealth(){
  if(!active||sourceHealthBusy||Date.now()-sourceHealthFetchedAt<20*60_000)return;
  sourceHealthBusy=true;
  try{
   sourceHealth=await getJson('/api/source-health',9000);
   sourceHealthFetchedAt=Date.now();
  }catch{sourceHealth={status:'unavailable',stale:true};sourceHealthFetchedAt=Date.now();}
  finally{sourceHealthBusy=false;if(active)render();}
 }
 async function fetchCalendars(){
  void refreshSourceHealth();
  if(!active||!profiles.length)return;
  const now=calendar(),week=weekKey(now);
  for(const school of new Set(profiles.map(p=>p.school))){
   const marker=school+'|'+week;
   const current=calendars.get(school);
   if(calendarInFlight.has(marker)||
      cacheableCalendar(current,school,now.year,now.week)&&
      Date.now()-(calendarFetchAt.get(marker)||0)<15*60_000){
    releaseOverviewIfReady();continue;
   }
   let stored=null;
   try{stored=readCalendarCache(sessionStorage,school,now.year,now.week);}catch{}
   if(stored){
    calendars.set(school,stored);calendarFetchAt.set(marker,Date.now());
    calendarStage.set(marker,2);releaseOverviewIfReady();render();continue;
   }
   calendarInFlight.add(marker);
   calendarStage.set(marker,0);
   void (async()=>{
    const url='/api/school-calendar?school='+encodeURIComponent(school)+
     '&year='+now.year+'&week='+now.week;
    const accept=(response,stage)=>{
     if(!active||weekKey(calendar())!==week||
        !cacheableCalendar(response,school,now.year,now.week)||
        (calendarStage.get(marker)||0)>stage)return;
     calendarStage.set(marker,stage);
     calendars.set(school,response);
     // Only public dates, scoped to this school and week, are retained.
     try{storeCalendarCache(sessionStorage,response,school,now.year,now.week);}catch{}
     calendarFetchAt.set(marker,Date.now());
     releaseOverviewIfReady();render();
    };
    // Fast official reserve copy first; the regular live-checked response
    // runs in parallel and supersedes it even if it resolves earlier.
    const snapshot=getJson(url+'&mode=snapshot',4000).then(
     response=>accept(response,1)).catch(()=>{});
    const live=getJson(url,12500).then(
     response=>accept(response,2)).catch(()=>{});
    await Promise.allSettled([snapshot,live]);
    calendarInFlight.delete(marker);
    if(!active||weekKey(calendar())!==week)return;
    if(!cacheableCalendar(calendars.get(school),school,now.year,now.week)){
     calendars.set(school,{schoolId:school,year:now.year,week:now.week,
      sourceStatus:'unavailable',events:[]});
     calendarFetchAt.set(marker,Date.now()-50*60_000);
    }
    releaseOverviewIfReady();render();
   })();
  }
 }
 const byId=id=>profiles.find(p=>p.id===id);
 function cachedReadyPlan(p){
  const plan=plans.get(p.id),now=calendar();
  // Only pass source-verified AI plans, not old/provisional parser results.
  return plan?.parser==='ai'&&plan?.aiStatus==='ready'&&plan.homeworkSourceVersion===1&&
   plan.status==='ok'&&plan.week===now.week&&plan.year===now.year?plan:null;
 }
 function openChildProfile(p){
  onOpenProfile(p,{upcoming:calendar().upcoming,cachedPlan:cachedReadyPlan(p)});
 }
 const setStatus=message=>{el('family-form-status').textContent=message||'';};
 const persist=()=>{
  if(cloud)return;
  if(!write(FAMILY_STORAGE_KEY,familyDocument(profiles)))
   setStatus('Lagring er blokkert i nettleseren. Endringene kan forsvinne.');
 };
 const cloudKey=(p,task,now)=>taskFingerprint({school:p.school,grade:p.grade,
   year:now.year,week:now.week,task});
 const cloudIsChecked=(p,task,now)=>cloudChecks.get(p.id)?.get(cloudKey(p,task,now))===true;
 const bagKey=(p,item,now,day)=>packingFingerprint({school:p.school,grade:p.grade,
  year:now.year,week:now.week,day,item});
 const cloudBagChecked=(p,item,now,day)=>bagChecks.get(p.id)?.get(bagKey(p,item,now,day))===true;
 async function syncCloud(){
  if(!cloud)return;
  const current=cloud,now=calendar();
  try{
   const [rows,bags]=await Promise.all([
    current.client.progress(current.familyId,now.year,now.week),
    current.client.packingProgress(current.familyId,now.year,now.week)
   ]);
   if(cloud!==current)return;
   cloudChecks=new Map();bagChecks=new Map();
   syncError='';lastSynced=new Date();
   for(const row of rows){
    if(!cloudChecks.has(row.child_id))cloudChecks.set(row.child_id,new Map());
    cloudChecks.get(row.child_id).set(row.task_key,row.completed);
   }
   for(const row of bags){
    if(!bagChecks.has(row.child_id))bagChecks.set(row.child_id,new Map());
    bagChecks.get(row.child_id).set(row.task_key,row.completed);
   }
   render();
  }catch(error){syncError='Kunne ikke synkronisere: '+error.message;render();}
 }
 async function updateCloud(p,task,checked){
  if(!cloud)throw Error('Ingen familiekonto aktiv.');
  const current=cloud,now=calendar(),key=cloudKey(p,task,now);
  const previous=cloudChecks.get(p.id)?.get(key);
  if(!cloudChecks.has(p.id))cloudChecks.set(p.id,new Map());
  cloudChecks.get(p.id).set(key,checked);render();
  try{
   await current.client.setTask({familyId:current.familyId,childId:p.id,
    year:now.year,week:now.week,key,completed:checked});
   lastSynced=new Date();syncError='';render();
  }catch(error){
   if(previous===undefined)cloudChecks.get(p.id)?.delete(key);
   else cloudChecks.get(p.id)?.set(key,previous);
   render();throw error;
  }
 }
 async function updateBag(p,item,day,checked){
  if(!cloud)throw Error('Ingen familiekonto aktiv.');
  const current=cloud,now=calendar(),key=bagKey(p,item,now,day);
  const previous=bagChecks.get(p.id)?.get(key);
  if(!bagChecks.has(p.id))bagChecks.set(p.id,new Map());
  bagChecks.get(p.id).set(key,checked);render();
  try{
   await current.client.setPacking({familyId:current.familyId,childId:p.id,
    year:now.year,week:now.week,key,completed:checked});
   lastSynced=new Date();syncError='';render();
  }catch(error){
   if(previous===undefined)bagChecks.get(p.id)?.delete(key);
   else bagChecks.get(p.id)?.set(key,previous);
   render();throw error;
  }
 }
 function getSummaries(){
  const now=calendar(),summaries=new Map();
  for(const p of profiles)summaries.set(p.id,profileSummary(p,plans.get(p.id),now,read,cloud?cloudIsChecked:null,
   cloud?cloudBagChecked:null));
  return {now,summaries};
 }
 function renderImportantNotices(model){
  const notices=importantFamilyNotices(model,{limit:3});
  const html=notices.visible.map(item=>{
   const when=item.date?new Intl.DateTimeFormat('nb-NO',{
    timeZone:'UTC',weekday:'long',day:'numeric',month:'short'
   }).format(new Date(item.date+'T12:00:00Z')):'Uten bestemt dag';
   return '<div class="family-important-entry">'+
    '<span class="family-important-date">'+escape(when)+'</span>'+
    familyAgendaItemHtml(item)+'</div>';
  }).join('');
  const message=!profiles.length?'Legg til barn for å se viktige skolebeskjeder.':
   model.missingProfiles.length?
    'Skoleplaner lastes inn. Viktige beskjeder kan fortsatt mangle.':
    'Ingen særskilte viktige beskjeder registrert for denne uka.';
  setHtml('family-important-cards',html||
   '<p class="family-important-empty">'+escape(message)+'</p>');
  el('family-mobile-important-more').hidden=notices.visible.length<=2;
  el('family-mobile-important-more').textContent=
   document.querySelector('#family-view .family-tomorrow')?.classList.contains('mobile-important-expanded')?
    'Vis færre beskjeder':'Vis alle viktige beskjeder';
  el('family-practical-label').textContent=notices.remaining?
   'Vis komplette skolebeskjeder · '+notices.remaining+' flere viktige':
   'Vis alle praktiske beskjeder og ekstra utstyr';
 }
 function renderAgenda(now,summaries){
  const filter=el('family-agenda-child'),selected=agendaChildId;
  const option='<option value="">Alle i familien</option>'+
   profiles.map(p=>'<option value="'+escape(p.id)+'">'+escape(p.name)+'</option>').join('');
  if(filter.innerHTML!==option)filter.innerHTML=option;
  agendaChildId=profiles.some(p=>p.id===selected)?selected:'';
  filter.value=agendaChildId;
  const model=buildFamilyWeekAgenda({profiles,summaries,plans,calendars,
   activities:activityUI.getRows(),calendar:now,childId:agendaChildId});
  const visible=focusedFamilyCalendar(model,{showWeekend});
  const markup=familyAgendaMarkup(visible,{today:now.today});
  setHtml('family-agenda-days',markup.days);
  setHtml('family-agenda-undated-list',markup.undated);
  const weekend=el('family-agenda-weekend-toggle');
  weekend.hidden=visible.weekendCount===0;
  weekend.setAttribute('aria-expanded',String(visible.weekendVisible));
  weekend.textContent=visible.weekendVisible?'Skjul helg':
   'Vis helg ('+visible.weekendCount+' hendelse'+(visible.weekendCount===1?'':'r')+')';
  mobileUI.refreshDays();
  el('family-agenda-undated').hidden=!model.undated.length;
  const importantUndated=model.undated.filter(item=>item.important).length;
  el('family-agenda-undated-summary').textContent=model.undated.length+
   ' punkt uten bestemt dag · Vis'+
   (importantUndated?' · ⚠ '+importantUndated+' viktig'+(importantUndated===1?'':'e'):'');
  el('family-agenda-status').textContent=
   visible.count+' hendelser'+(visible.weekendVisible?' mandag–søndag':' mandag–fredag')+
   ' i uke '+now.week+
   (agendaChildId?' for '+(profiles.find(p=>p.id===agendaChildId)?.name||'valgt barn'):' for familien');
  // The overview alert strip always covers every child, regardless of
  // which child is currently selected within the week calendar.
  const fullModel=agendaChildId?buildFamilyWeekAgenda({profiles,summaries,plans,calendars,
   activities:activityUI.getRows(),calendar:now,childId:''}):model;
  renderImportantNotices(fullModel);
  const pending=model.missingProfiles;
  el('family-agenda-missing').hidden=!pending.length;
  el('family-agenda-missing').textContent=pending.length?
   'Ukeplan ikke klar for '+pending.join(', ')+'. Skolens opplysninger kan mangle. Sjekk original-PDF-en.':'';
 }
 const taskList=(p,items,message)=>items.length?
  '<ul class="family-checklist">'+items.map(x=>
    '<li class="content-kind-homework"><label><input type="checkbox" data-family-check="'+escape(p.id)+'" data-family-index="'+x.index+'" '+
    (x.checked?'checked ':'')+'aria-label="Marker lekse ferdig for '+escape(p.name)+'"><span>'+
    '<span class="content-type-label content-kind-homework">'+contentCategoryLabel('homework')+'</span> '+
    escape((x.subject?x.subject+': ':'')+x.text)+'</span></label></li>').join('')+'</ul>':
  '<p class="family-muted">'+escape(message)+'</p>';
 function childCard(p,s,now){
  const school=siteConfig.schools[p.school],stored=plans.get(p.id);
  const plan=stored?.year===now.year&&stored?.week===now.week?stored:null;
  const aiLabel=plan?.aiStatus==='ready'?'✓ AI-tolket PDF · lagret':
   plan?.aiStatus==='processing'?'✦ AI tolker PDF automatisk …':
   plan?.aiStatus==='failed'?'⚠ AI-tolkingen feilet':
   plan?.aiStatus==='disabled'||plan?.aiStatus==='unavailable'?'Regelbasert PDF-lesing':null;
  const pct=s.ready&&s.total?Math.round(100*s.done/s.total):0;
  const practice=s.ready?wordStatus(p,plan,now):null;
  const packingList=(items,day)=>items.length?
   '<ul class="family-checklist">'+items.map(x=>'<li><label>'+
    '<input type="checkbox" data-family-bag="'+escape(p.id)+'" data-family-bag-day="'+escape(day)+'" '+
    'data-family-bag-key="'+escape(bagKey(p,x,now,day))+'" '+((cloud?bagChecks.get(p.id)?.get(bagKey(p,x,now,day)):x.checked)?'checked ':'')+
    (!cloud?'disabled ':'')+'aria-label="Pakket '+escape(x.label)+' for '+escape(p.name)+'">'+
    '<span>'+escape(x.label)+'</span></label></li>').join('')+'</ul>':
   '<p class="family-muted">Ingen ekstra utstyr denne dagen</p>';
  const allPacking=plan?DAYS.map(day=>({day,items:scopedPackingItems(plan,p,day)})):[];
  const details=s.ready?[
   '<div class="family-child-progress"><div><span>Lekser i uke '+now.week+'</span><b>'+s.done+' / '+s.total+' fullført</b></div>',
   '<div class="family-progress-track" role="progressbar" aria-label="Fullført for '+escape(p.name)+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'"><span style="width:'+pct+'%"></span></div></div>',
   '<details class="family-child-extra"'+(expandedChildren.has(p.id)?' open':'')+'><summary>Se lekser, pakkeliste og ordøving</summary><div class="family-child-extra-content">',
   now.upcoming?
    '<div class="family-child-columns"><div><h4>📚 Lekser i uke '+now.week+'</h4>'+taskList(p,s.tasks,'Ingen lekser registrert')+'</div>'+
    '<div><h4>🎒 Pakk til mandag</h4>'+packingList(s.todayBag,DAYS[0])+'</div></div>':
    '<div class="family-child-columns"><div><h4>📚 I dag</h4>'+taskList(p,s.today,'Ingen lekser med frist i dag')+'</div>'+
    '<div><h4>🎒 Pakk til '+(s.nextIndex==null?'neste skoledag':DAYS[s.nextIndex])+'</h4>'+
     (s.nextIndex==null?'<p class="family-muted">Neste uke er ikke hentet ennå</p>':
      packingList(s.bag,DAYS[s.nextIndex]))+'</div></div>',
   '<details class="family-packing-week"><summary>🎒 Se og kryss av utstyr alle dager</summary>'+
    allPacking.map(({day,items})=>'<section><h4>'+escape(day)+'</h4>'+
      packingList(items,day)+'</section>').join('')+'</details>'+
   '<p class="family-word-state">'+(practice?'✦ Ordøving: '+practice.attempted+' / '+practice.total+(practice.weak?', '+practice.weak+' trenger øving':''):'✦ Ingen ordøving i denne ukeplanen')+'</p></div></details>'
  ].join(''):'<div class="family-not-ready" role="status">'+escape(
    plan?.status==='unpublished'||plan?.status==='unavailable'?
     'Ukeplan for uke '+now.week+' er ikke tilgjengelig ennå. Skolen har ikke publisert PDF for denne uka.':
     errors.get(p.id)||s.reason||'Henter ukeplan for uke '+now.week+' …')+'</div>';
  const compactStatus=s.ready?'<span class="family-mobile-progress-label">Lekser</span><span>'+
   s.done+' av '+s.total+' ferdig</span>':
   '<span class="family-mobile-progress-label">'+escape(
    plan?.status==='unpublished'?'Ukeplan ikke publisert':errors.get(p.id)||'Henter ukeplan …')+'</span>';
  const compact='<button type="button" class="family-child-compact" data-family-compact-open="'+escape(p.id)+'" '+
   'aria-label="Åpne ukeplan for '+escape(p.name)+'">'+
   '<span class="family-mobile-child-head"><span class="family-avatar" aria-hidden="true">'+
   escape(p.name.slice(0,1).toUpperCase())+'</span><span class="family-mobile-child-identity">'+
   '<strong>'+escape(p.name)+'</strong><small>'+escape(p.grade)+'. klasse'+
   (p.group?' · '+escape(p.group):'')+'</small></span>'+
   '<span class="family-mobile-child-chevron" aria-hidden="true">›</span></span>'+
   '<span class="family-mobile-progress">'+compactStatus+'</span>'+
   (s.ready?'<span class="family-mobile-progress-track" aria-hidden="true"><span style="width:'+pct+'%"></span></span>':'')+
   '</button>';
  return '<article class="family-child" data-child-id="'+escape(p.id)+'">'+compact+'<div class="family-child-heading">'+
   '<span class="family-avatar" aria-hidden="true">'+escape(p.name.slice(0,1).toUpperCase())+'</span>'+
   '<div><h3>'+escape(p.name)+'</h3><p>'+escape(school?.name||'Skole')+' · '+escape(p.grade)+'. klasse'+(p.group?' · '+escape(p.group):'')+'</p>'+
   '<span class="family-child-week">UKE '+now.week+' · '+now.year+(now.upcoming?' · NESTE UKE':'')+'</span></div></div>'+
   (aiLabel?'<p class="family-ai-label" role="status">'+escape(aiLabel)+'</p>':'')+
   details+'<div class="family-child-actions">'+
   (plan?.aiStatus==='failed'?'<button type="button" class="family-soft" data-family-retry="'+escape(pairOf(p))+'">Prøv AI-tolkning igjen</button>':'')+
   '<button type="button" class="family-open" data-family-open="'+escape(p.id)+'">Åpne ukeplan →</button>'+ 
   '<button type="button" class="family-mobile-more" data-family-more="'+escape(p.id)+'" aria-expanded="'+String(mobileMoreOpen.has(p.id))+'">⋯ Flere</button>'+
   (cloud?'<button type="button" class="family-child-invite" data-family-pair="'+escape(p.id)+'">📱 Inviter barnet (QR)</button>':'')+
   '<button type="button" class="family-soft" data-family-edit="'+escape(p.id)+'">Endre</button>'+
   '<button type="button" class="family-remove" data-family-remove="'+escape(p.id)+'">Fjern</button>'+
   '</div></article>';
 }
 function render(){
  if(!active)return;
  const {now,summaries}=getSummaries();
  el('family-week').textContent='Uke '+now.week+' · '+now.year+(now.upcoming?' · neste uke':'');
  el('family-count').textContent=profiles.length+' barn';
  el('family-mobile-week').textContent='Uke '+now.week;
  el('family-storage-label').textContent=cloud?'☁ Synkronisert familie · lekser deles mellom foresatte':'🔒 Kun på denne enheten';
  const ready=[...summaries.values()].filter(x=>x.ready);
  const done=ready.reduce((n,x)=>n+x.done,0),total=ready.reduce((n,x)=>n+x.total,0);
  el('family-week-progress').textContent=ready.length?done+' av '+total+' lekser fullført':
   now.upcoming?'Avventer ukeplan':'Ukeoversikt';
  el('family-week-context').textContent=now.upcoming?
   'Skoleuka er over for denne uken. Viser kun uke '+now.week+'.':
   'Lekser, pakkeliste og beskjeder for barna i uke '+now.week+'.';
  el('family-sync-status').textContent=cloud?
    (syncError|| (lastSynced?'Sist synkronisert kl. '+lastSynced.toLocaleTimeString('nb-NO',{hour:'2-digit',minute:'2-digit'}):'Henter synkronisert progresjon …')) :
    'Avkrysninger lagres lokalt i nettleseren';
  el('family-form-tip').textContent=cloud?
   'Bruk gjerne kallenavn. Profilene synkroniseres mellom foresatte i familien.':
   'Bruk gjerne kallenavn. Profilene lagres bare i denne nettleseren.';
  el('family-bottom-note').textContent=cloud?
   'Opplysninger hentes fra skolens egne ukeplaner. Ved tvil er original-PDF fasit. Lekseavkrysninger synkroniseres, mens ordøving lagres lokalt.':
   'Opplysninger hentes fra skolens egne ukeplaner. Ved tvil er original-PDF fasit. Uten familiekonto lagres avkrysningene bare på denne enheten.';
  activityUI.render();
  renderAgenda(now,summaries);
  el('family-add').disabled=profiles.length>=FAMILY_MAX_PROFILES;
  el('family-mobile-add').disabled=profiles.length>=FAMILY_MAX_PROFILES;
  el('family-add').textContent=profiles.length>=FAMILY_MAX_PROFILES?'Maks seks barn':'+ Legg til barn';
  el('family-empty').hidden=profiles.length!==0;
  // Preserve manually expanded child details after a checkbox saves progress.
  // The content is refreshed but the parent's place in the UI is retained.
  const presentCards=[...el('family-cards').querySelectorAll('.family-child[data-child-id]')];
  if(presentCards.length)mobileMoreOpen=new Set(presentCards.filter(card=>
   card.classList.contains('mobile-more-open')).map(card=>card.dataset.childId));
  if(presentCards.length)expandedChildren=new Set(presentCards.filter(card=>
   card.querySelector('.family-child-extra')?.open).map(card=>card.dataset.childId));
  setHtml('family-cards',profiles.map(p=>childCard(p,summaries.get(p.id),now)).join(''));
  for(const card of el('family-cards').querySelectorAll('.family-child[data-child-id]'))
   card.classList.toggle('mobile-more-open',mobileMoreOpen.has(card.dataset.childId));
  const {next}=schoolDayIndices(now);
  const shownFocus=now.upcoming?'week':focus;
  const tabs=document.querySelector('.family-focus-tabs');
  tabs.hidden=now.upcoming;
  for(const button of tabs.querySelectorAll('[data-family-focus]'))
   button.setAttribute('aria-pressed',String(button.dataset.familyFocus===shownFocus));
  el('family-next-day').textContent=now.upcoming?'i uke '+now.week:
   shownFocus==='today'?'i dag':
   shownFocus==='week'?'denne uka':next==null?'neste skoleuke':'til '+DAYS[next].toLocaleLowerCase('nb-NO');
  const pdfCandidates=now.upcoming||!(shownFocus==='next'&&next==null)?
   practicalHighlights({profiles,summaries,plans,calendar:now,focus:shownFocus}):[];
  const municipalCandidates=calendarHighlights({profiles,calendars,calendar:now,focus:shownFocus});
  const pendingReveal=overviewBatch&&holdInitialHighlights({
   startedAt:overviewBatch.startedAt,now:Date.now(),
   pendingPairs:overviewBatch.pairs.size,
   pendingCalendars:overviewBatch.schools.filter(s=>
    !cacheableCalendar(calendars.get(s),s,now.year,now.week)).length});
  const rankedCards=applyPracticalPriority([...municipalCandidates,...pdfCandidates],item=>{
   const p=byId(item.id),state=p&&priorityStates.get(pairOf(p));
   return state?.status==='ready'?state.scores?.[priorityKey(item)]:null;
  });
  const orderKey=weekKey(now)+'|'+shownFocus+'|'+profiles.map(p=>p.id).join(',');
  const cards=lastReminderOrder?.key===orderKey&&!pendingReveal?
   stableHighlightOrder(rankedCards,lastReminderOrder.ids):rankedCards;
  if(!pendingReveal)lastReminderOrder={key:orderKey,ids:cards.map(highlightIdentity)};
  reportCards=cards;
  const statuses=[...new Set(profiles.map(p=>p.school))]
   .map(school=>calendars.get(school))
   .filter(x=>x&&x.year===now.year&&x.week===now.week);
  const absent=profiles.length&&statuses.length<new Set(profiles.map(p=>p.school)).size;
  const unusable=statuses.some(x=>x.sourceStatus==='unavailable');
  const snapshots=statuses.filter(x=>x.sourceStatus==='snapshot');
  el('family-calendar-source').hidden=!profiles.length;
  const monitored=sourceHealth?.status==='verified'&&!sourceHealth?.stale;
  const sourceWarning=sourceHealth?.status==='changed'?
   'Endringer i kommunens kilde må kontrolleres. Reserveversjonen brukes der datoene er uavklarte.':
   sourceHealth?.stale?
   'Kommunens kilde er ikke nylig verifisert. Reserveversjonen fra sist kontrollerte kilde kan være utdatert.':
   '';
  el('family-calendar-status').textContent=!profiles.length?'':absent?
   'Sjekker den offisielle skoleruta for aktuelle skoler …':
   unusable?'Skoleruta er ikke tilgjengelig for alle skoler. Sjekk kommunens oversikt direkte.':
   sourceWarning|| (snapshots.length?
    'Kommunal skolerute: reserveversjon med dato for siste kontroll. Lokale avvik kan forekomme.':
    monitored?'Kommunens kilde er nylig verifisert. Lokale avvik kan forekomme.':
    'Kommunal skolerute: automatisk kildekontroll er ikke bekreftet. Sjekk originalen ved tvil.');
  el('family-report-missing').hidden=profiles.length===0;
  const limit=5,displayed=showAllHighlights?cards:cards.slice(0,limit);
  const reminderMarkup=displayed.map(x=>{
   if(x.sourceType==='municipal'){
    const dateLabel=new Date(x.date+'T12:00:00Z').toLocaleDateString('nb-NO',{
     timeZone:'UTC',weekday:'long',day:'numeric',month:'long'});
    const authority='https://www.kristiansand.kommune.no/navigasjon/barnehage-og-skole/skole-og-sfo/skoleruta/';
    const schoolLink=siteConfig.schools[x.schoolId]?.homepage||authority;
    const sfo=x.sfoStatus==='closed'?
     'SFO: kommunen bekrefter stengt denne dagen.':
     'SFO: åpning eller stenging er ikke oppgitt for denne dagen. Sjekk skolens SFO.';
    const summary=x.schoolFree?'Elevene har fri ifølge kommunens skolerute.':'SFO er stengt ifølge kommunens skolerute.';
    const sourceName=x.sourceStatus==='snapshot'?'Kommunal skolerute (sist kontrollert '+escape(x.checkedAt||'2026-10-30')+')':
     'Kommunal skolerute';
    return '<article class="family-reminder family-reminder-priority family-reminder-workday family-reminder-municipal content-kind-municipal">'+
     '<span aria-hidden="true">🏫</span><div><span class="content-type-label content-kind-municipal">'+contentCategoryLabel('municipal')+'</span><strong>'+escape(x.name)+'</strong>'+
     '<span class="family-reminder-importance">Påvirker arbeidsdagen</span>'+
     '<span class="family-reminder-date">'+escape(dateLabel)+'</span>'+
     '<p class="family-reminder-short">'+escape(x.label.replace(/^\\S+\\s*:\\s*/u,''))+'</p>'+
     '<p class="family-municipal-context">'+escape(summary)+' '+escape(sfo)+'</p>'+
     '<p class="family-municipal-caution">Kommunal standard: skolen kan ha lokale avvik.</p>'+
     '<span class="family-municipal-source">'+sourceName+'</span>'+
     '<a class="family-reminder-pdf" href="'+escape(authority)+
     '" target="_blank" rel="noopener noreferrer">Se offisiell skolerute ↗</a> · '+
     '<a class="family-reminder-pdf" href="'+escape(schoolLink)+
     '" target="_blank" rel="noopener noreferrer">Se skolens nettside ↗</a>'+
     '</div><div class="family-reminder-actions">'+
     '<button type="button" data-family-open="'+escape(x.id)+'">Se ukeplan →</button>'+
     '<button type="button" class="family-report-button" data-family-report="'+cards.indexOf(x)+'">Rapporter feil</button>'+
     '</div></article>';
   }
   const impact=x.adultImpact;
   const emphasized=Boolean(impact)||x.aiImportance===3;
   const tag=impact==='workday'?'Påvirker arbeidsdagen':
    impact==='health'?'Viktig helseinformasjon':
    emphasized?(x.aiPrepareAhead?'Forbered i forkant':'Viktig beskjed'):null;
   const p=plans.get(x.id);
   const digest=practicalDigest(x,{year:now.year,week:now.week,pdf:p?.pdf});
   const shortened=digest.shortText!==digest.fullText;
   const sourceQuote=digest.sourceQuote&&digest.sourceQuote!==digest.fullText?
    '<p class="family-reminder-quote"><span>Kildeutdrag:</span> '+escape(digest.sourceQuote)+'</p>':'';
   const pdfLink=digest.pdfUrl?'<a class="family-reminder-pdf" href="'+escape(digest.pdfUrl)+
    '" target="_blank" rel="noopener noreferrer">Se original PDF ↗</a>':'';
   const details='<details class="family-reminder-detail"><summary>'+
    (shortened?'Les hele beskjeden':'Se kildedetaljer')+'</summary>'+
    '<p>'+escape(digest.fullText)+'</p>'+sourceQuote+pdfLink+'</details>';
   return '<article class="family-reminder content-kind-practical'+(emphasized?' family-reminder-priority':'')+
    (impact==='workday'?' family-reminder-workday':'')+'">'+
    '<span aria-hidden="true">'+x.icon+'</span><div><span class="content-type-label content-kind-practical">'+
    contentCategoryLabel('practical')+'</span><strong>'+escape(x.name)+'</strong>'+
    (tag?'<span class="family-reminder-importance">'+escape(tag)+'</span>':'')+
    (digest.dateLabel?'<span class="family-reminder-date">'+escape(digest.dateLabel)+'</span>':'')+
    '<p class="family-reminder-short">'+escape(digest.shortText)+'</p>'+
    details+'</div><div class="family-reminder-actions"><button type="button" data-family-open="'+escape(x.id)+
    '" aria-label="Åpne ukeplan for '+escape(x.name)+'">Se ukeplan →</button>'+
    '<button type="button" class="family-report-button" data-family-report="'+cards.indexOf(x)+
    '" aria-label="Rapporter feil i beskjeden for '+escape(x.name)+'">Rapporter feil</button></div></article>';
  }).join('');
  const expand=cards.length>limit?
   '<button id="family-reminders-more" class="family-reminders-more" type="button" aria-expanded="'+
   String(showAllHighlights)+'">'+(showAllHighlights?'Vis færre':'Vis alle '+cards.length+' praktiske beskjeder')+'</button>':'';
  const noPlan=now.upcoming?'Ukeplan for uke '+now.week+' er ikke tilgjengelig ennå. Vi sjekker automatisk når skolen publiserer PDF-en.':
   'Ingen tilgjengelige ukeplaner akkurat nå.';
  const empty=loading.size?'Sjekker ukeplan for uke '+now.week+' …':
   !profiles.length?'Legg til et barn for å se huskelisten.':
   ready.length?'Ingen spesielle beskjeder eller ekstra ting å pakke i denne perioden. Se hvert barns ukeplan for lekser.':noPlan;
  const hold=pendingReveal;
  const reminderBody=!now.upcoming&&shownFocus==='next'&&next==null?
   '<p class="family-muted">Neste ukes oppgaver blir tilgjengelige når skolen publiserer ny ukeplan.</p>':
   reminderMarkup+expand||
   '<p class="family-muted">'+escape(empty)+'</p>';
  setHtml('family-reminders',hold?
   '<p class="family-muted family-reminders-loading" role="status">Samler ukeplaner og skolerute …</p>':
   reminderBody);
  const analyzing=[...pendingJobs.values()].filter(job=>job.mode==='poll').length;
  el('family-load-status').textContent=loading.size?'Sjekker '+loading.size+' ukeplan(er) for nye PDF-er …':
   analyzing?'AI tolker '+analyzing+' ukeplan(er) automatisk. Resultatet vises når analysen er ferdig.':
   errors.size?'Noen ukeplaner kunne ikke hentes. Prøv Oppdater.':syncError;
 }
 // /api/plan finds the newest PDF and checks the content-hash against the
 // site-wide, durable Netlify Blobs AI cache. It queues the job only on a miss.
 function applyPair(pair,plan,error,sequence){
  if(!active||sequence!==run)return;
  const now=calendar();
  for(const p of pairProfiles(pair)){
   loading.delete(p.id);
   if(error||!plan||plan.year!==now.year||plan.week!==now.week){
    plans.delete(p.id);
    errors.set(p.id,error||'Skolens ukeplan gjelder ikke aktuell uke.');
   }else{
    plans.set(p.id,plan);errors.delete(p.id);
   }
  }
  render();
 }
 function clearPairJob(pair){
  const timer=pollTimers.get(pair);
  if(timer)clearTimeout(timer);
  pollTimers.delete(pair);pendingJobs.delete(pair);
 }
 function schedulePoll(pair,sequence,delay){
  if(!active||sequence!==run||document.visibilityState==='hidden')return;
  const job=pendingJobs.get(pair);
  if(!job)return;
  const existing=pollTimers.get(pair);
  if(existing)clearTimeout(existing);
  const timer=setTimeout(()=>{
   pollTimers.delete(pair);
   if(job.mode==='cooldown')void fetchPair(pair,sequence);
   else void pollPair(pair,sequence);
  },delay);
  pollTimers.set(pair,timer);
 }
 function setPending(pair,plan,sequence){
  if(!active||sequence!==run)return;
  if(plan?.aiStatus==='processing'){
   const existing=pendingJobs.get(pair);
   const same=existing?.jobId===plan.jobId&&existing.mode==='poll';
   pendingJobs.set(pair,{mode:'poll',jobId:plan.jobId||null,
    attempt:same?existing.attempt:0,startedAt:same?existing.startedAt:Date.now()});
   schedulePoll(pair,sequence,pollDelay(0));
  }else if(plan?.aiStatus==='failed'&&(autoRetries.get(pair)||0)<1){
   // A prior visitor may have triggered the failed analysis. Respect the
   // server's five-minute failure cooldown, then start one fresh attempt.
   autoRetries.set(pair,(autoRetries.get(pair)||0)+1);
   pendingJobs.set(pair,{mode:'cooldown',retryAt:Date.now()+RETRY_COOLDOWN_MS});
   schedulePoll(pair,sequence,RETRY_COOLDOWN_MS);
  }else{
   clearPairJob(pair);
  }
  render();
 }
 async function fetchPair(pair,sequence){
  if(!active||sequence!==run)return;
  const [school,grade]=pair.split('|');
  // A full request checks the school site and PDF bytes. A cached AI result
  // is reused; an updated PDF (even at the same URL) gets a new hash and job.
  let plan=null,error=null;
  try{plan=await getJson('/api/plan?school='+encodeURIComponent(school)+
    '&grade='+encodeURIComponent(grade)+(calendar().upcoming?'&nextWeek=1':''),60000);}
  catch(e){error=e.message||'Klarte ikke hente ukeplan.';}
  if(!active||sequence!==run||!pairProfiles(pair).length)return;
  applyPair(pair,plan,error,sequence);
  setPending(pair,plan,sequence);
  if(overviewBatch?.sequence===sequence){
   overviewBatch.pairs.delete(pair);releaseOverviewIfReady();
  }
  if(!error&&plan?.aiStatus==='ready')requestPriority(pair,plan,sequence);
 }
 async function pollPair(pair,sequence){
  if(!active||sequence!==run||document.visibilityState==='hidden')return;
  const job=pendingJobs.get(pair);
  if(!job||job.mode!=='poll')return;
  const [school,grade]=pair.split('|');
  let response;
  try{
   const url=job.jobId?'/api/ai-status?job='+encodeURIComponent(job.jobId):
    '/api/plan?school='+encodeURIComponent(school)+'&grade='+encodeURIComponent(grade)+
    '&statusOnly=1'+(calendar().upcoming?'&nextWeek=1':'');
   response=await getJson(url,16000);
  }catch{
   if(!active||sequence!==run||pendingJobs.get(pair)!==job)return;
   job.attempt++;
   if(Date.now()-job.startedAt<16*60_000){
    schedulePoll(pair,sequence,pollDelay(job.attempt));
   }else{
    clearPairJob(pair);
    const previous=plans.get(pairProfiles(pair)[0]?.id);
    applyPair(pair,{...previous,aiStatus:'failed',
     warning:'Klarte ikke kontrollere AI-status. Prøv på nytt.'},null,sequence);
   }
   return;
  }
  if(!active||sequence!==run||pendingJobs.get(pair)!==job)return;
  if(response.aiStatus==='processing'){
   job.attempt++;
   if(Date.now()-job.startedAt<16*60_000)schedulePoll(pair,sequence,pollDelay(job.attempt));
   else{
    clearPairJob(pair);
    const previous=plans.get(pairProfiles(pair)[0]?.id);
    applyPair(pair,{...previous,aiStatus:'failed',
     warning:'AI-tolkingen bruker for lang tid. Prøv på nytt.'},null,sequence);
   }
   return;
  }
  if(response.aiStatus==='ready'){
   // AI-status is only a fast cache lookup. Fetch the canonical plan once
   // to validate extracted homework deadlines and detect a newer PDF.
   await fetchPair(pair,sequence);
   return;
  }
  if(response.aiStatus==='failed'){
   const oldPlan=plans.get(pairProfiles(pair)[0]?.id);
   applyPair(pair,{...oldPlan,aiStatus:'failed',
    warning:response.warning||'AI-analysen feilet. Vi prøver igjen etter en kort pause.'},null,sequence);
   const retries=autoRetries.get(pair)||0;
   if(retries<1){
    autoRetries.set(pair,retries+1);
    pendingJobs.set(pair,{mode:'cooldown',retryAt:Date.now()+RETRY_COOLDOWN_MS});
    schedulePoll(pair,sequence,RETRY_COOLDOWN_MS);
   }else clearPairJob(pair);
   render();
   return;
  }
  // An unexpected status is not treated as a completed AI analysis.
  job.attempt++;
  schedulePoll(pair,sequence,pollDelay(job.attempt));
 }
 async function fetchPlans(){
  if(!active)return;
  const sequence=++run,now=calendar();
  const targetKey=weekKey(now);
  if(loadedWeekKey!==targetKey){
   loadedWeekKey=targetKey;plans.clear();autoRetries.clear();cloudChecks.clear();bagChecks.clear();
   priorityStates.clear();showAllHighlights=false;
   if(cloud)void syncCloud();
  }
  lastPlanCheckAt=Date.now();
  stopPollTimers();pendingJobs.clear();
  loading.clear();errors.clear();
  for(const p of profiles)loading.add(p.id);
  const pairs=[...new Set(profiles.map(pairOf))];
  clearOverviewTimer();
  if(pairs.length&&profiles.some(p=>{
   const value=plans.get(p.id);
   return !value||value.year!==now.year||value.week!==now.week;
  })){
   const batch={sequence,startedAt:Date.now(),pairs:new Set(pairs),
    schools:[...new Set(profiles.map(p=>p.school))]};
   overviewBatch=batch;
   overviewTimer=setTimeout(()=>{
    if(overviewBatch===batch){overviewBatch=null;render();}
   },FAMILY_OVERVIEW_BATCH_MS);
  }else overviewBatch=null;
  // Start both integrations together. Do not serialize municipal with PDF.
  void fetchCalendars();render();
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(2,pairs.length)},async()=>{
   while(cursor<pairs.length){
    const pair=pairs[cursor++];
    await fetchPair(pair,sequence);
   }
  }));
 }
 function resumeAnalysis(){
  if(!active||document.visibilityState==='hidden')return;
  if(weekKey(calendar())!==loadedWeekKey||
     Date.now()-lastPlanCheckAt>=2*60_000){void api.refresh();return;}
  for(const [pair,job] of pendingJobs){
   if(pollTimers.has(pair))continue;
   const delay=job.mode==='cooldown'?Math.max(1000,job.retryAt-Date.now()):1000;
   schedulePoll(pair,run,delay);
  }
 }
 function closeForm(){editing=null;el('family-form').hidden=true;setStatus('');}
 async function loadGrades(current=''){
  const i=++gradeRun,school=el('family-school').value,select=el('family-grade');
  select.disabled=true;select.replaceChildren(new Option('Velg skole først',''));
  if(!school)return;
  select.replaceChildren(new Option('Henter klassetrinn …',''));
  try{
   const data=await getJson('/api/grades?school='+encodeURIComponent(school),26000);
   if(i!==gradeRun)return;
   select.replaceChildren(new Option('Velg klassetrinn',''));
   for(const g of data.grades||[]){
    if(/^[1-7](?:[A-F])?$/i.test(g.code||''))select.add(new Option(g.code+'. klasse',g.code));
   }
   select.disabled=select.options.length<=1;
   if(current)select.value=current;
   if(select.disabled)setStatus('Ingen publiserte klassetrinn er tilgjengelige.');
  }catch{
   if(i===gradeRun){select.replaceChildren(new Option('Prøv å velge skole på nytt',''));setStatus('Klarte ikke hente klassetrinn.');}
  }
 }
 function openForm(p=null){
  editing=p?.id||null;
  el('family-form').hidden=false;
  el('family-form-title').textContent=p?'Rediger barneprofil':'Legg til barn';
  el('family-name').value=p?.name||'';
  el('family-school').value=p?.school||'';
  el('family-group').value=p?.group||'';
  el('family-save').textContent=p?'Lagre endringer':'Legg til i familien';
  setStatus('');void loadGrades(p?.grade||'');el('family-name').focus();
 }
 const schools=Object.values(siteConfig.schools).sort((a,b)=>a.name.localeCompare(b.name,'nb-NO'));
 el('family-school').innerHTML='<option value="">Velg skole</option>'+schools.map(s=>
  '<option value="'+escape(s.id)+'">'+escape(s.name)+'</option>').join('');
 const api={
  isActive:()=>active,hasProfiles:()=>profiles.length>0,profileById:byId,
  firstProfile:()=>profiles[0]||null,
  activitiesForProfile:(id,year,week,date)=>activityOccurrences(activityUI.getRows(),year,week)
   .filter(x=>x.date===date&&(!x.child_id||x.child_id===id)),
  cachedReadyPlan:id=>{const p=byId(id);return p?cachedReadyPlan(p):null;},
  isCloudProfile:id=>Boolean(cloud&&byId(id)),
  isHomeworkChecked:(id,task)=>{
    const p=byId(id);return Boolean(p&&cloud&&cloudIsChecked(p,task,calendar()));
  },
  updateHomework:async(id,task,checked)=>{
    const p=byId(id);if(!p||!task)throw Error('Fant ikke denne leksen.');
    await updateCloud(p,task,checked);
  },
  setCloud:async(client,familyId,remoteChildren)=>{
    cloud={client,familyId};
    profiles=remoteChildren.map(x=>({id:x.id,name:x.nickname,school:x.school_id,
      grade:x.grade,group:x.group_name||''})).filter(x=>Object.hasOwn(siteConfig.schools,x.school));
    plans.clear();cloudChecks.clear();bagChecks.clear();loadedWeekKey=null;activityUI.onFamilyChanged();await syncCloud();
    if(active){render();void fetchPlans();}
  },
  clearCloud:()=>{
    cloud=null;cloudChecks.clear();bagChecks.clear();lastSynced=null;syncError='';profiles=readFamily(read(FAMILY_STORAGE_KEY),siteConfig.schools);
    plans.clear();loadedWeekKey=null;activityUI.onFamilyChanged();if(active){render();void fetchPlans();}
  },
  refreshCloud:async()=>{await Promise.all([syncCloud(),activityUI.refresh()]);},
  enter:()=>{
    if(active)return;
    active=true;activityUI.enter();onModeChange();
    // Returning from an already-open child plan should restore instantly,
    // not re-download the same school PDF seconds later.
    const now=calendar();
    const recentlyChecked=loadedWeekKey===weekKey(now)&&
      Date.now()-lastPlanCheckAt<2*60_000&&profiles.every(p=>{
       const plan=plans.get(p.id);
       return plan?.year===now.year&&plan?.week===now.week&&plan.aiStatus==='ready';
      });
    if(!recentlyChecked)void fetchPlans();
    else{render();void fetchCalendars();}
  },
  leave:()=>{active=false;activityUI.leave();run++;clearOverviewTimer();overviewBatch=null;
   stopPollTimers();pendingJobs.clear();autoRetries.clear();
    for(const [pair,state] of priorityStates)if(state.status!=='ready')priorityStates.delete(pair);
    loading.clear();onModeChange();},
  refresh:()=>{if(active){if(cloud)void syncCloud();void activityUI.refresh();void fetchPlans();}}
 };
 el('family-add').addEventListener('click',()=>openForm());
 el('family-mobile-add').addEventListener('click',()=>openForm());
 el('family-mobile-admin-toggle').addEventListener('click',()=>{
  const panel=el('family-mobile-admin-panel');
  const expanded=panel.classList.toggle('is-open');
  el('family-view').classList.toggle('family-mobile-managing',expanded);
  el('family-mobile-admin-toggle').setAttribute('aria-expanded',String(expanded));
 });
 el('family-empty-add').addEventListener('click',()=>openForm());
 el('family-mobile-important-more').addEventListener('click',()=>{
  const section=document.querySelector('#family-view .family-tomorrow');
  const expanded=section.classList.toggle('mobile-important-expanded');
  el('family-mobile-important-more').setAttribute('aria-expanded',String(expanded));
  el('family-mobile-important-more').textContent=expanded?'Vis færre beskjeder':'Vis alle viktige beskjeder';
 });
 el('family-important-cards').addEventListener('click',event=>{
  const button=event.target.closest('[data-family-agenda-details]');
  if(!button)return;
  const card=button.closest('.family-agenda-item');
  if(!card)return;
  const expanded=card.classList.toggle('is-expanded');
  button.setAttribute('aria-expanded',String(expanded));
  button.textContent=expanded?'Skjul detaljer':'Mer info';
 });
 for(const button of document.querySelectorAll('[data-family-focus]')){
  button.addEventListener('click',()=>{focus=button.dataset.familyFocus;showAllHighlights=false;render();});
 }
 // Recheck when the parent returns to the tab; automatically inspect
 // the source every 15 minutes while the family screen stays visible.
 document.addEventListener('visibilitychange',()=>{
   if(document.visibilityState==='hidden')stopPollTimers();
   else{
    resumeAnalysis();
    if(active&&cloud)void syncCloud();
   }
  });
 setInterval(()=>{
  if(active&&document.visibilityState==='visible'){
   if(cloud&&(!lastSynced||Date.now()-lastSynced.getTime()>12_000))void syncCloud();
   if(weekKey(calendar())!==loadedWeekKey||Date.now()-lastPlanCheckAt>=AUTO_CHECK_MS)
    api.refresh();
  }
 },15_000);
 const reportingContexts=()=>[...new Map(profiles.map(p=>{
  const cal=calendar(),plan=plans.get(p.id);
  const value={school:p.school,grade:p.grade,year:cal.year,week:cal.week,
   pdf:plan?.pdf||null};
  return [p.school+'|'+p.grade,value];
 })).values()];
 el('family-report-missing').addEventListener('click',()=>{
  const contexts=reportingContexts();
  if(contexts.length)onReportIssue?.({contexts,kind:'missing_notice'});
 });
 el('family-practical-details').addEventListener('toggle',()=>{
  if(!el('family-practical-details').open)return;
  // The expanded view must include ALL critical notices, not only the
  // original 'next school day' focus.
  focus='week';render();
 });
 el('family-agenda-child').addEventListener('change',event=>{
  agendaChildId=event.target.value;showWeekend=false;render();
 });
 el('family-agenda-weekend-toggle').addEventListener('click',()=>{
  showWeekend=!showWeekend;render();
 });
 for(const id of ['family-agenda-days','family-agenda-undated']){
  el(id).addEventListener('click',event=>{
   const details=event.target.closest('[data-family-agenda-details]');
   if(details){
    const card=details.closest('.family-agenda-item');
    if(!card)return;
    const expanded=card.classList.toggle('is-expanded');
    details.setAttribute('aria-expanded',String(expanded));
    details.textContent=expanded?'Skjul detaljer':'Mer info';
    return;
   }
   const button=event.target.closest('[data-family-agenda-edit]');
   if(button){
    mobileUI.selectView('activities');
    activityUI.editActivity(button.dataset.familyAgendaEdit);
   }
  });
 }
 el('family-reminders').addEventListener('click',e=>{
  if(e.target.closest('#family-reminders-more')){
   showAllHighlights=!showAllHighlights;render();return;
  }
  const report=e.target.closest('[data-family-report]');
  if(report){
   const x=reportCards[Number(report.dataset.familyReport)],p=x&&byId(x.id);
   if(p)onReportIssue?.({contexts:[{school:p.school,grade:p.grade,
    year:calendar().year,week:calendar().week,pdf:plans.get(p.id)?.pdf||null}],
    kind:'wrong_interpretation',sourceItem:x.label,sourcePage:x.sourcePage||null});
   return;
  }
  const button=e.target.closest('[data-family-open]');
  if(button){const p=byId(button.dataset.familyOpen);if(p)openChildProfile(p);}
 });
 el('family-cancel').addEventListener('click',closeForm);
 el('family-refresh').addEventListener('click',api.refresh);
 el('family-return').addEventListener('click',()=>{api.leave();onOpenSingle();});
 el('family-school').addEventListener('change',()=>{setStatus('');void loadGrades();});
 el('family-form').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!el('family-school').value||!el('family-grade').value){setStatus('Velg skole og klassetrinn.');return;}
  const p={id:editing||crypto.randomUUID(),name:el('family-name').value,
   school:el('family-school').value,grade:el('family-grade').value,group:el('family-group').value};
  const button=el('family-save');button.disabled=true;
  try{
   if(cloud){
    const fields={nickname:p.name,school_id:p.school,grade:p.grade,group_name:p.group};
    const rows=editing?await cloud.client.updateChild(editing,cloud.familyId,fields):
      await cloud.client.createChild({...fields,family_id:cloud.familyId});
    const row=rows?.[0];if(!row)throw Error('Kunne ikke lagre profilen. Kontroller tilgangen.');
    profiles=putProfile(profiles,{id:row.id,name:row.nickname,school:row.school_id,
     grade:row.grade,group:row.group_name||''},siteConfig.schools);
   }else{profiles=putProfile(profiles,p,siteConfig.schools);persist();}
   closeForm();activityUI.render();render();void fetchPlans();
  }catch(error){setStatus(error.message);}
  finally{button.disabled=false;}
 });
 el('family-cards').addEventListener('change',e=>{
  const input=e.target.closest('input[data-family-check]');
  if(!input)return;
  const p=byId(input.dataset.familyCheck),index=Number(input.dataset.familyIndex);
  if(!p||!Number.isInteger(index)||index<0)return;
  const now=calendar(),key=childProgressKey(p,now.year,now.week,'homework');
  let checked={};try{checked=JSON.parse(read(key)||'{}')||{};}catch{}
  if(cloud){
   const item=expandHomework(plans.get(p.id)?.homework||[])[index];
   if(item)void updateCloud(p,item,input.checked).catch(error=>{
    el('family-load-status').textContent='Endringen ble ikke lagret: '+error.message;
   });
  }else{
   checked[index]=input.checked;
   if(!write(key,JSON.stringify(checked)))el('family-load-status').textContent='Kunne ikke lagre avkrysning lokalt.';
   render();
  }
 });
 el('family-cards').addEventListener('change',e=>{
  const input=e.target.closest('input[data-family-bag]');
  if(!input||!cloud)return;
  const p=byId(input.dataset.familyBag),day=input.dataset.familyBagDay;
  if(!p)return;
  const plan=plans.get(p.id);
  const item=plan&&DAYS.includes(day)?scopedPackingItems(plan,p,day).find(x=>
   bagKey(p,x,calendar(),day)===input.dataset.familyBagKey):null;
  if(!item)return;
  void updateBag(p,item,day,input.checked).catch(error=>{
   el('family-load-status').textContent='Pakkestatus ble ikke lagret: '+error.message;
  });
 });
 el('family-cards').addEventListener('click',e=>{
  const more=e.target.closest('[data-family-more]');
  if(more){
   const id=more.dataset.familyMore;
   if(mobileMoreOpen.has(id))mobileMoreOpen.delete(id);else mobileMoreOpen.add(id);
   more.setAttribute('aria-expanded',String(mobileMoreOpen.has(id)));
   more.closest('.family-child')?.classList.toggle('mobile-more-open',mobileMoreOpen.has(id));
   return;
  }
  const retry=e.target.closest('[data-family-retry]');
  if(retry){
   autoRetries.delete(retry.dataset.familyRetry);
   api.refresh();
   return;
  }
  const open=e.target.closest('[data-family-compact-open], [data-family-open]');
  if(open){const p=byId(open.dataset.familyCompactOpen||open.dataset.familyOpen);if(p)openChildProfile(p);return;}
  const pair=e.target.closest('[data-family-pair]');
  if(pair){const p=byId(pair.dataset.familyPair);if(p&&cloud)childPairingUI.open(p);return;}
  const edit=e.target.closest('[data-family-edit]');
  if(edit){const p=byId(edit.dataset.familyEdit);if(p)openForm(p);return;}
  const remove=e.target.closest('[data-family-remove]');
  if(remove){
   const p=byId(remove.dataset.familyRemove);
   if(p&&confirm(cloud?'Fjerne '+p.name+'? Da slettes også progresjonen i familiekontoen.':
    'Fjerne '+p.name+' fra familien? Avkrysninger på denne enheten slettes ikke.')){
    if(cloud){
     void cloud.client.removeChild(p.id,cloud.familyId).then(()=>{
      profiles=profiles.filter(x=>x.id!==p.id);plans.delete(p.id);cloudChecks.delete(p.id);
      activityUI.render();
      render();void fetchPlans();
     }).catch(error=>{el('family-load-status').textContent=error.message;});
    }else{
     profiles=profiles.filter(x=>x.id!==p.id);plans.delete(p.id);loading.delete(p.id);
     persist();activityUI.render();render();void fetchPlans();
    }
   }
  }
 });
 window.addEventListener('storage',e=>{
  if(e.key!==FAMILY_STORAGE_KEY||cloud)return;
  profiles=readFamily(e.newValue,siteConfig.schools);
  if(active){activityUI.render();render();void fetchPlans();}
 });
 return api;
}
