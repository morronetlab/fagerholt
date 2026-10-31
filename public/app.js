import {siteConfig} from './site-config.mjs';
import {initFamilyUI} from './family-ui.mjs';
import {initAccountUI} from './account-ui.mjs';
import {childProgressKey,groupApplies} from './shared/family-core.mjs';
import {smartDayChoice} from './shared/smart-day.mjs';
import {initWordQuiz,renderWordQuiz,quizItems} from './shared/word-quiz.mjs';
import {openHomeworkHelper,initHomeworkHelper} from './homework-helper.mjs';
import {initIssueReporter} from './report-issue.mjs';
import {needsHomeworkHelp} from './shared/homework-help-eligibility.mjs';
import {familyWeekCalendar,schoolCalendar,dayDate,DAYS} from './shared/calendar.mjs';
import {schoolSelectionKey,validSchool,gradeSelectionKey,validGrade,progressKey} from './shared/selection.mjs';
import {planFeedback} from './shared/plan-feedback.mjs';
import {normalizeVisualRegion,adjustableVisualRegion,visualCropGeometry,fullPageGeometry} from './shared/visual-region.mjs';
import {homeworkProgress,groupColorClass} from './shared/group-scope.mjs';
import {expandHomework,repeatDayLabel} from './shared/homework-view.mjs';
import {dueDayLabel,packingText} from './shared/plan-display.mjs';
import {uniqueDayEvents,groupSimultaneousEvents,notesWithImportantEvents,isVaccineNotice,noDayScheduleMessage} from './shared/day-view.mjs';
import {estimateAiSeconds,estimatedPercent} from './shared/ai-estimate.mjs';
// This module is served from public/. Calendar and selection modules are mirrored in public/shared/.
const $ = id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const {brand,features}=siteConfig;
let familyUI=null;
let accountUI=null;
// Only the visible section changes; existing school, child and progress storage keys stay intact.
let primaryView="welcome";
let navigationReady=false,restoringRoute=false;
const NAV_KEY='skoleukaRouteV1';
// SPA route changes begin at the top, but opening/closing the account modal
// preserves the exact previous scroll position.
function scrollNewViewToTop(){
 const top=()=>window.scrollTo({top:0,left:0,behavior:'instant'});
 top();
 requestAnimationFrame(top);
}
function navigationSnapshot(){
 return {[NAV_KEY]:true,view:familyUI?.isActive()?'family':primaryView,
  school:state.school?.id||null,grade:state.grade||null,profileId:state.profileId||null,
  upcoming:viewingNextWeek,year:calendar.year,week:calendar.week,day:state.day};
}
function recordNavigation(mode='push'){
 if(!navigationReady||restoringRoute)return;
 const snapshot=navigationSnapshot(),previous=history.state;
 if(previous?.[NAV_KEY]&&JSON.stringify(previous)===JSON.stringify(snapshot))return;
 try{history[mode==='replace'?'replaceState':'pushState'](snapshot,'',location.href);}
 catch(error){console.warn('Kunne ikke lagre app-navigasjonen',error?.message);}
}

let calendar=schoolCalendar(new Date(),siteConfig.school.timezone);
let actualCalendar=calendar;
let viewingNextWeek=false;
let dayWasSelected=false;
const currentChoice=()=>smartDayChoice(new Date(),siteConfig.school.timezone);
const storageRead=(key)=>{try{return localStorage.getItem(key);}catch{return null;}};
const storageWrite=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
const storageDrop=(key)=>{try{localStorage.removeItem(key);}catch{}};
const state={profileId:null,school:null,grade:null,availableGrades:null,gradeError:null,day:calendar.weekday,plan:null,loading:false,weather:null,weatherError:null,planError:null,requestId:0,aiPolls:0,aiTimer:null,statusChecking:false,analysisStartedAt:null,analysisTicker:null,specialKey:null,specialRenderId:0,expandedSpecial:new Set(),specialAdjustments:new Map()};
const weekDayDate=day=>dayDate(calendar.year,calendar.week,day);
const titleDay=day=>new Date(`${weekDayDate(day)}T12:00:00Z`).toLocaleDateString('nb-NO',{timeZone:'UTC',day:'numeric',month:'short'});
const progress=(section,day='all')=>state.profileId?childProgressKey({id:state.profileId,school:state.school.id,grade:state.grade},calendar.year,calendar.week,section,day):progressKey(state.school.id,state.grade,calendar.year,calendar.week,section,day);
function isChecked(section,index,day='all'){
  if(section==='homework'&&state.profileId&&familyUI?.isCloudProfile(state.profileId)){
   const task=expandHomework(state.plan?.homework||[])[index];
   return task?familyUI.isHomeworkChecked(state.profileId,task):false;
  }
  try{return Boolean(JSON.parse(storageRead(progress(section,day))||'{}')[index]);}catch{return false;}
}
function setChecked(section,index,day,checked){
  if(section==='homework'&&state.profileId&&familyUI?.isCloudProfile(state.profileId)){
   const task=expandHomework(state.plan?.homework||[])[index];
   if(!task)return;
   void familyUI.updateHomework(state.profileId,task,checked).then(()=>renderContent())
    .catch(error=>{renderContent();window.alert('Kunne ikke lagre leksen: '+error.message);});
   renderContent();
   return;
  }
  const key=progress(section,day);
  let data={};try{data=JSON.parse(storageRead(key)||'{}')||{};}catch{}
  data[index]=checked;storageWrite(key,JSON.stringify(data));renderContent();
}
function badge(status){
  return ({loading:'Henter ukeplan …',ok:'Ukeplan hentet',partial:'Delvis tolket PDF',unreadable:'PDF kunne ikke tolkes',unpublished:'Ikke publisert ennå',unavailable:'Finner ikke trinnside',error:'Ukeplan utilgjengelig'})[status]||'Ukeplan';
}
function getBag(){
  const p=state.plan;if(!p)return [];
  const raw=[...(p.everyday||[]),...(p.days?.[DAYS[state.day]]?.bring||[])].filter(x=>x&&typeof x.label==='string');
  return [...new Map(raw.map(x=>[(x.label+'::'+(x.group||'')).toLocaleLowerCase('nb-NO'),x])).values()];
}
function renderSchoolChoices(query=''){
  const normalize=t=>String(t||'').toLocaleLowerCase('nb-NO').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ø/g,'o').replace(/æ/g,'ae');
  const term=normalize(query.trim());
  const list=Object.values(siteConfig.schools).filter(s=>normalize(s.name).includes(term))
    .sort((a,b)=>a.name.localeCompare(b.name,'nb-NO'));
  $('school-match-count').textContent=`${list.length} skoler`;
  $('school-choices').innerHTML=list.length?list.map(s=>`<button class="school-choice" type="button" data-school="${safe(s.id)}"><span>${safe(s.name)}${s.kind==='combined'?'<br><small class="school-type">1.–10. skole</small>':''}</span><span class="school-chevron" aria-hidden="true">→</span></button>`).join(''):
    '<p class="school-empty">Fant ingen skoler. Prøv et annet søk.</p>';
}
function renderGradeChoices(){
  const grades=state.availableGrades||[];
  $('grade-loading-message').textContent=state.gradeError||(!state.availableGrades?'Henter klassetrinn fra skolen …':!grades.length?'Ingen publiserte trinnsider funnet. Sjekk skolens nettside.':'Velg barnets klassetrinn eller gruppe.');
  $('grade-choices').innerHTML=grades.map(g=>`<button type="button" class="grade" data-grade="${safe(g.code)}"><strong>${safe(g.code)}</strong><span>${g.code.length>1?'gruppe':'trinn'}</span></button>`).join('');
  $('grade-missing').hidden=!state.availableGrades||grades.length>0;
  if(state.school)$('grade-school-link').href=state.school.homepage;
}
function renderShell(){
  const hasSchool=Boolean(state.school),chosen=Boolean(state.grade&&hasSchool),inFamily=Boolean(familyUI?.isActive());
  const welcome=primaryView==='welcome'&&!inFamily;
  const section=inFamily?'family':welcome?'welcome':'plan';
  $('welcome-view').hidden=!welcome;
  $('family-view').hidden=!inFamily;
  $('school-gate').hidden=inFamily||welcome||hasSchool;
  $('grade-gate').hidden=inFamily||welcome||!hasSchool||chosen;
  $('app-view').hidden=inFamily||welcome||!chosen;
  for(const btn of document.querySelectorAll('[data-nav]')){
    const active=btn.dataset.nav===section;
    if(active)btn.setAttribute('aria-current','page');
    else btn.removeAttribute('aria-current');
  }
  $('family-toggle').setAttribute('aria-pressed',String(inFamily));
  $('footer-school').textContent=inFamily?'Familieoversikt':state.school?.name||'Kristiansand';
  if(inFamily||welcome||!hasSchool)return;
  if(!chosen){
    $('gate-school').textContent=state.school.name;
    renderGradeChoices();
    return;
  }
  const selectedProfile=state.profileId?familyUI?.profileById(state.profileId):null;
  $('plan-context-class').textContent=(selectedProfile?selectedProfile.name+' · ':'')+
   state.school.name+' · '+state.grade+'. trinn';
  for(const id of ['change-school','change-grade','mobile-selection-menu'])
   $(id).hidden=Boolean(selectedProfile);
  $('plan-back-family').hidden=!selectedProfile;
  $('plan-welcome-title').textContent=selectedProfile?'Hei, '+selectedProfile.name+'! ☀️':'Morgenklar! ☀️';
  $('school-name').textContent=`${state.school.name.toLocaleUpperCase('nb-NO')} · ${state.grade}. KLASSE`;
  $('welcome-description').textContent=`Se hva som skjer i ${state.grade}. klasse, og kryss av det du har gjort.`;
  $('school-source').href=state.plan?.source||state.school.grades?.[state.grade]||state.school.homepage;
  $('week-label').textContent=`UKE ${calendar.week}`;
  $('smart-week').hidden=!viewingNextWeek;
  $('smart-week').textContent=viewingNextWeek?'Neste uke · automatisk valgt':'';
  $('back-this-week').hidden=!viewingNextWeek||
    (Boolean(state.profileId)&&familyWeekCalendar(new Date(),siteConfig.school.timezone).upcoming);
  $('day-buttons').innerHTML=DAYS.map((d,i)=>`<button type="button" class="day ${i===state.day?'active':''} ${i<calendar.weekday?'past':''}" data-day="${i}" aria-current="${i===state.day?'date':'false'}"><span>${safe(d)}</span><strong>${titleDay(i)}</strong></button>`).join('');
  renderContent();
}
function navigateTo(view,{record=true}={}){
  if(view==='family'){
    if(familyUI.isActive()){renderShell();scrollNewViewToTop();return;}
    primaryView='plan';
    cancelRequests();
    familyUI.enter();
    if(record)recordNavigation();
    scrollNewViewToTop();
    return;
  }
  primaryView=view==='welcome'?'welcome':'plan';
  if(familyUI.isActive())familyUI.leave();
  else renderShell();
  if(primaryView==='plan'&&!state.school)$('school-search').focus({preventScroll:true});
  if(record)recordNavigation();
  scrollNewViewToTop();
}
function groupBadge(group){
  if(!group)return '';
  // Compound labels are rendered as separate, correctly coloured badges.
  return String(group).split(/\s*\/\s*/).map(label=>label.trim()).filter(Boolean)
    .map(label=>`<span class="group-badge ${groupColorClass(label)}">${safe(label)}</span>`).join('');
}
function checklist(items,section,day='all'){
  return items.map((item,i)=>{
    const label=typeof item==='string'?item:(item?.text||item?.label||'');
    const due=section==='homework'?dueDayLabel(item,{allowTextFallback:state.plan?.parser!=='ai'}):null;
    const meta=typeof item==='object'&&item?.subject&&!(due&&item.subject.toLowerCase()===due.toLowerCase())?`<span class="subject">${safe(item.subject)}</span>`:'';
    const hint=section==='bag'&&item?.note?`<small>${safe(item.note)}</small>`:'';
    const dueBadge=due?`<span class="homework-due">📅 ${safe(due)}</span>`:'';
    const repeatBadge=section==='homework'&&repeatDayLabel(item)?`<span class="homework-repeat">${safe(repeatDayLabel(item))}</span>`:'';
    const displayLabel=section==='bag'?packingText(label):label;
    if(section==='homework')return `<div class="homework-assist-row"><label class="checkrow ${isChecked(section,i,day)?'done':''}"><input type="checkbox" data-check="${section}" data-index="${i}" data-progress-day="${day}" ${isChecked(section,i,day)?'checked':''}><span class="checktext">${groupBadge(item?.group)}${dueBadge}${repeatBadge}${meta}${safe(displayLabel)}${hint}</span></label>${needsHomeworkHelp(item)?`<button type="button" class="helper-open" data-helper-task="${i}" aria-label="Få hjelp til denne leksen">✨ Få hjelp</button>`:''}</div>`;
    return `<label class="checkrow ${isChecked(section,i,day)?'done':''}"><input type="checkbox" data-check="${section}" data-index="${i}" data-progress-day="${day}" ${isChecked(section,i,day)?'checked':''}><span class="checktext">${groupBadge(item?.group)}${dueBadge}${repeatBadge}${meta}${safe(displayLabel)}${hint}</span></label>`;
  }).join('');
}
function empty(msg){return `<p class="empty"><span aria-hidden="true">ℹ️</span> ${safe(msg)}</p>`;}
function renderFeedback(){
  const info=planFeedback({school:state.school,grade:state.grade,plan:state.plan,error:state.planError,loading:state.loading});
  const el=$('plan-feedback');
  el.hidden=!info;
  $('plan-body').hidden=Boolean(info?.hideContent);
  if(!info)return;
  el.className=`plan-feedback ${info.kind==='analyzing'?'feedback-analyzing':info.kind==='fetching'?'feedback-fetching':info.kind==='partial'?'feedback-partial':'feedback-missing'}`;
  $('feedback-eyebrow').textContent=info.eyebrow;
  $('feedback-title').textContent=info.title;
  $('feedback-description').textContent=info.description;
  $('feedback-school-link').hidden=!info.showSchool;
  $('feedback-school-link').href=state.school.homepage;
  $('feedback-school-link').setAttribute('aria-label',`Åpne nettsiden til ${state.school.name} i ny fane`);
  const original=state.plan?.pdf||state.plan?.source;
  $('feedback-grade-link').hidden=!info.showGrade||!original;
  if(original){
    $('feedback-grade-link').href=original;
    $('feedback-grade-link').firstChild.textContent=state.plan?.pdf?'Se original-PDF ':'Se trinnsiden ';
  }
  $('analysis-progress').hidden=info.kind!=='analyzing';
  $('feedback-report-issue').hidden=!['missing','partial'].includes(info.kind);
  $('feedback-retry').hidden=!info.showRetry;
  $('feedback-retry').disabled=info.kind==='analyzing'&&state.statusChecking;
  $('feedback-retry').textContent=info.kind==='analyzing'?(state.statusChecking?'Sjekker AI-status …':'↻ Sjekk AI-status'):'↻ Prøv igjen';
}
function updateAnalysisClock(){
 const active=state.plan?.aiStatus==='processing';
 if(!active){
  if(state.analysisTicker)clearInterval(state.analysisTicker);
  state.analysisTicker=null;state.analysisStartedAt=null;return;
 }
 if(state.analysisStartedAt===null)state.analysisStartedAt=Date.now();
 const elapsed=Math.max(0,Math.floor((Date.now()-state.analysisStartedAt)/1000));
 $('analysis-elapsed').textContent=`Tid brukt: ${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}`;
 const seconds=estimateAiSeconds({pages:state.plan?.pdfPageCount,bytes:state.plan?.pdfSizeBytes});
 const estimate=estimatedPercent(elapsed,seconds);
 $('analysis-percent').textContent=`Ca. ${estimate} %`;
 $('analysis-progress-track').setAttribute('aria-valuenow',String(estimate));
 $('analysis-progress-track').setAttribute('aria-valuetext',`Estimert ${estimate} prosent; faktisk fremdrift ukjent`);
 $('analysis-progress-fill').style.width=estimate+'%';
 $('analysis-time-hint').textContent=elapsed>seconds?`Analysen tar lenger tid enn forventet. Beregnet tid var ca. ${seconds} sekunder; vi sjekker fortsatt automatisk.`:`Anslått ca. ${seconds} sekunder basert på PDF-ens størrelse og sidetall. Prosenten er estimert.`;
 if(!state.analysisTicker)state.analysisTicker=setInterval(updateAnalysisClock,1000);
}
function renderContent(){
  if(!state.grade)return;
  const p=state.plan;
  const waitingForPlan=state.loading||p?.aiStatus==='processing';
  $('weather-panel').hidden=waitingForPlan||!features.weather;
  $('app-hero').classList.toggle('is-awaiting',waitingForPlan);
  const status=state.loading?'loading':state.planError?'error':p?.status||'loading';
  $('status-pill').textContent=p?.aiStatus==='processing'?'AI analyserer · foreløpig ukeplan':p?.status==='partial'?'Ukeplan delvis tolket':p?.status==='unreadable'?'PDF kunne ikke tolkes':p?.aiStatus==='ready'?'AI-tolket ukeplan':p?.aiStatus==='failed'?'AI-feil · foreløpig ukeplan':badge(status);
  $('status-pill').className='state-pill '+(p?.aiStatus==='processing'?'state-ai-processing':p?.aiStatus==='ready'?'state-ai-ready':['error','unreadable'].includes(status)?'state-error':['partial','unpublished','unavailable'].includes(status)?'state-warning':'');
  renderFeedback();
  const pending=p?.aiStatus==='processing';
  $('plan-body').hidden=state.loading||pending||Boolean(planFeedback({school:state.school,grade:state.grade,plan:p,error:state.planError})?.hideContent);
  $('plan-body').classList.toggle('ai-pending',pending);
  $('plan-body').setAttribute('aria-busy',String(pending));
  updateAnalysisClock();
  const msg=state.planError||p?.warning;
  // The prominent banner already explains the missing PDF or AI processing.
  const feedbackVisible=!$('plan-feedback').hidden;
  $('warning-area').hidden=!msg||feedbackVisible;
  $('warning-area').textContent=!feedbackVisible?msg||'':'';
  $('pdf-source').hidden=!p?.pdf;if(p?.pdf)$('pdf-source').href=p.pdf;
  if(p?.source&&state.school)$('school-source').href=p.source;
  const selectedProfile=state.profileId?familyUI?.profileById(state.profileId):null;
  const allEvents=uniqueDayEvents(p?.days?.[DAYS[state.day]]?.events||[])
   .filter(x=>!selectedProfile||groupApplies(x,selectedProfile));
  // A vaccination is a practical notice, not an additional timetable row.
  const events=allEvents.filter(x=>!isVaccineNotice(x.title));
  const groupedEvents=groupSimultaneousEvents(events);
  const notes=notesWithImportantEvents(allEvents,(p?.dayNotes?.[DAYS[state.day]]||[])
   .filter(x=>x&&x.text&&(!selectedProfile||groupApplies(x,selectedProfile))));
  const groups=[...new Set([...events,...getBag()].map(x=>x.group).filter(Boolean))];
  $('day-group-summary').hidden=!groups.length;
  $('day-group-summary').innerHTML=groups.length?`<strong>Husk riktig gruppe denne dagen:</strong> ${groups.map(groupBadge).join(' ')}`:'';
  $('day-program').innerHTML=p?.status==='unpublished'?empty('Ingen ukeplan publisert for denne uken.'):
    groupedEvents.length?groupedEvents.map(block=>`<div class="event"><span class="event-dot">●</span><span class="event-content">
      ${block.time?`<small class="event-time">${safe(block.time)}</small>`:''}
      ${block.entries.map(e=>`<span class="event-subitem">${groupBadge(e.group)}${safe(e.title)}${e.endTime?`<small class="event-endtime">${safe(e.endTime)}</small>`:''}</span>`).join('')}
    </span></div>`).join(''):
    empty(state.loading?'Henter dagsprogram …':noDayScheduleMessage({hasNotes:notes.length>0,complete:p?.status==='ok'&&p?.parser==='ai'}));
  $('day-notes').hidden=!notes.length;
  $('day-notes-list').innerHTML=notes.map(x=>`<p class="${x.important?'day-note-critical':''}">${x.important?'<strong>💉 Viktig: Vaksinasjon</strong>':''}${groupBadge(x.group)}${safe(x.text)}</p>`).join('');
  const attendance=(p?.attendance||[]).filter(x=>x.day===DAYS[state.day]&&x.group&&x.time);
  $('day-attendance').hidden=!attendance.length;
  $('day-attendance').innerHTML=attendance.length?`<div class="attendance-heading">⏰ Særskilt oppmøte for enkelte grupper</div>${attendance.map(x=>`<div class="attendance-entry">${groupBadge(x.group)}<strong>Kl. ${safe(x.time)}</strong><span>${safe(x.text)}</span></div>`).join('')}`:'';
  const bag=getBag().filter(x=>!selectedProfile||groupApplies(x,selectedProfile));
  $('bag-list').innerHTML=bag.length?checklist(bag,'bag',DAYS[state.day]):empty(state.loading?'Henter pakkelisten …':'Ingen ekstra utstyr oppgitt for denne dagen.');
  $('plan-columns').classList.toggle('bag-empty',!bag.length&&!state.loading);
  const dayDateValue=dayDate(calendar.year,calendar.week,state.day);
  const activities=selectedProfile?
   familyUI.activitiesForProfile(selectedProfile.id,calendar.year,calendar.week,dayDateValue):[];
  $('plan-day-activities').hidden=!selectedProfile||!activities.length;
  $('plan-day-activity-list').innerHTML=activities.map(x=>
   '<article class="plan-day-activity"><span class="plan-day-activity-time">'+
   safe(String(x.start_time||'').slice(0,5)||'Etter skolen')+'</span>'+
   '<div><strong>'+safe(x.title)+'</strong>'+
   (x.location?'<small>'+safe(x.location)+'</small>':'')+
   (x.responsible?'<small>Ansvarlig: '+safe(x.responsible)+'</small>':'')+
   (x.notes?'<p>'+safe(x.notes)+'</p>':'')+'</div></article>').join('');
  const vocabulary=Array.isArray(p?.vocabulary)?p.vocabulary:[];
  renderWordQuiz(vocabulary,{school:state.school?.id,grade:state.grade,week:calendar.week,year:calendar.year,...(state.profileId?{childId:state.profileId}:{})});
  const quizVocabulary=quizItems(vocabulary);
  const englishWords=quizVocabulary.filter(x=>x.language==='en');
  const norwegianWords=quizVocabulary.filter(x=>x.language==='nb');
  $('vocabulary-panel').hidden=!englishWords.length;
  $('vocabulary-panel-nb').hidden=!norwegianWords.length;
  $('vocabulary-title').textContent='Engelske gloser';
  $('vocabulary-list').innerHTML=englishWords.length?
    '<div class="practice-words-label">GLOSER FRA UKAS PDF</div><ul class="practice-word-list">'+
    englishWords.map(x=>`<li><strong>${safe(x.word)}</strong><span>${safe(x.translation||'Øv på uttale og staving')}</span></li>`).join('')+'</ul>':'';
  $('vocabulary-list-nb').innerHTML=norwegianWords.length?
    '<div class="practice-words-label">ØVEORD FRA UKAS PDF</div><ul class="practice-word-list practice-word-list-nb">'+
    norwegianWords.map(x=>`<li><strong>${safe(x.word)}</strong></li>`).join('')+'</ul>':'';
  const contacts=Array.isArray(p?.contacts)?p.contacts:[];
  $('contacts-panel').hidden=!contacts.length;
  $('contacts-list').innerHTML=contacts.map(c=>typeof c==='string'?`<p>${safe(c)}</p>`:`<p><strong>${safe(c.name)}</strong> ${safe(c.role)} ${c.email?`<a href="mailto:${encodeURIComponent(c.email)}">${safe(c.email)}</a>`:''} ${c.phone?`<span>${safe(c.phone)}</span>`:''}</p>`).join('');
  const hw=expandHomework(p?.homework||[]);
  $('homework-list').innerHTML=hw.length?checklist(hw,'homework'):empty(state.loading?'Henter lekser …':'Ingen lekser ble funnet i PDF-en.');
  renderHomeworkProgress(hw);
  const hasTheme=features.theme&&Boolean(p?.weekTheme);
  // Older cached AI plans can also misclassify vaccination as a school subject.
  const subjects=(Array.isArray(p?.subjects)?p.subjects:[])
    .flatMap(x=>String(x||'').split(/[\n;•]+/))
    .map(x=>x.trim()).filter(x=>x&&!isVaccineNotice(x));
  const missionText=features.optionalMission?(p?.optionalMission||''):'';
  const isSuggestedMission=Boolean(missionText&&!p?.optionalMission);
  const hasMission=Boolean(missionText);
  $('theme-panel').hidden=!(hasTheme||hasMission);
  $('subjects-panel').hidden=false;
  $('subjects-panel').classList.toggle('compact-empty',!subjects.length);
  $('subjects-list').innerHTML=subjects.length?subjects.map(x=>`<p class="subject-item">${safe(x)}</p>`).join(''):empty('Ingen egne fagoversikter oppgitt i denne ukeplanen.');
  $('theme-content').hidden=!hasTheme;$('theme-content').textContent=p?.weekTheme||'';
  $('mission-slot').innerHTML=(!hasMission?'':
    isChecked('mission',0)?`<button type="button" class="mission-done" id="undo-mission">✓ Frivillig oppdrag fullført · Vis igjen</button>`:
    `<div class="mission"><div><strong>🌟 Frivillig oppdrag ${isSuggestedMission?'· forslag fra Ukeplanen':''}</strong><p>${safe(missionText)}</p></div><label class="mission-check"><input type="checkbox" data-check="mission" data-index="0" data-progress-day="all"> Fullført</label></div>`);
  const notices=p?.notices||[];
  $('notices-count').textContent=notices.length?notices.length:'';
  $('notices-panel').classList.toggle('compact-empty',!notices.length);
  $('notices-empty-hint').hidden=Boolean(notices.length);
  if(!notices.length)$('notices-panel').open=false;
  $('notices-list').innerHTML=notices.length?notices.map(x=>`<p>${groupBadge(x?.group)}${safe(typeof x==='string'?x:x?.text||x?.detail||x?.title)}</p>`).join(''):empty('Ingen beskjeder ble funnet i PDF-en.');
  const goals=features.learningGoals?p?.learningGoals||[]:[];
  $('goals-panel').hidden=!features.learningGoals;
  $('goals-panel').classList.toggle('compact-empty',!goals.length);
  $('goals-empty-hint').hidden=Boolean(goals.length);
  if(!goals.length)$('goals-panel').open=false;
  $('goals-count').textContent=goals.length;
  $('goals-list').innerHTML=goals.length?goals.map(x=>`<p>${groupBadge(x?.group)}${safe(typeof x==='string'?x:x?.text||x?.detail||'')}</p>`).join(''):empty('Ingen egne læringsmål oppgitt for denne uka.');
  renderSpecialContent();
  renderWeather();
}
function renderHomeworkProgress(homework){
 const box=$('homework-progress');
 const progress=homeworkProgress(homework,i=>isChecked('homework',i));
 box.hidden=!progress.total;
 if(!progress.total)return;
 $('homework-progress-bar').style.width=progress.percent+'%';
 $('homework-progress-track').setAttribute('aria-valuenow',String(progress.percent));
 $('homework-progress-count').textContent=`${progress.done} av ${progress.total} lekser ferdig`;
 $('homework-progress-message').textContent=progress.complete?'🏆 Alle lekser er gjort! Du klarte det!':progress.percent>=70?'🌟 Snart i mål!':progress.percent>=30?'🚀 Bra jobbet, fortsett slik!':'✨ Klar for å samle stjerner?';
 box.classList.toggle('is-complete',progress.complete);
 $('homework-progress-stars').textContent=progress.complete?'⭐⭐⭐':progress.percent>=70?'⭐⭐☆':progress.percent>=30?'⭐☆☆':'☆☆☆';
}
function renderSpecialContent(){
  const p=state.plan, items=Array.isArray(p?.specialContent)?p.specialContent.slice(0,4):[];
  const panel=$('special-panel');
  panel.hidden=!items.length;
  if(!items.length){state.specialKey=null;$('special-items').replaceChildren();return;}
  const key=[state.school?.id,state.grade,p?.pdf,items.map(x=>[x.title,x.sourcePage,x.hasVisual,JSON.stringify(x.visualRegion)].join(':')).join('|')].join('::');
  if(state.specialKey===key)return;
  state.specialKey=key;state.expandedSpecial=new Set();state.specialAdjustments=new Map();
  $('special-items').innerHTML=items.map((item,index)=>{
    const page=Number(item.sourcePage);
    const crop=normalizeVisualRegion(item.visualRegion);
    const pageLink=p.pdf&&page>0?`${p.pdf}#page=${page}`:p.pdf;
    return `<article class="special-card">
      <div class="special-copy"><p class="special-type">${item.kind==='knowledge'?'💡 KUNNSKAPSHJØRNET':item.kind==='illustration'?'🖼️ FRA PDF-EN':'✨ EKSTRA FRA SKOLEN'}</p>
      <h3>${groupBadge(item.group)}${safe(item.title)}</h3><p>${safe(item.description)}</p>
      ${p.pdf?`<a href="${safe(pageLink)}" target="_blank" rel="noopener noreferrer">Se side ${page} i original-PDF ↗</a>`:''}</div>
      ${item.hasVisual&&crop&&p.pdf&&Number.isInteger(page)&&page>=1&&page<=16?`<div id="special-visual-${index}" class="special-visual" data-special-page="${page}" data-special-index="${index}" role="img" aria-label="Utsnitt fra original PDF-side ${page}: ${safe(item.title)}"><span>Henter illustrasjonen fra skolens PDF …</span></div><div class="special-crop-actions"><button type="button" class="special-crop-button" data-special-widen="horizontal" data-special-index="${index}">↔ Mer bredde</button><button type="button" class="special-crop-button" data-special-widen="vertical" data-special-index="${index}">↕ Mer over/under</button></div><button type="button" class="special-expand" data-special-expand="${index}" aria-controls="special-visual-${index}" aria-expanded="false">↗ Vis hele PDF-siden</button>`:''}
      </article>`;
  }).join('');
  if(p.pdf)void renderSpecialPdfPages(key);
}
async function renderSpecialPdfPages(key){
  const targets=[...$('special-items').querySelectorAll('[data-special-page]')];
  if(!targets.length)return;
  let pdf;const renderId=++state.specialRenderId;
  try{
    const module=await import('/vendor/pdf.mjs');
    if(state.specialKey!==key||state.specialRenderId!==renderId)return;
    module.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.mjs';
    const proxy=`/api/pdf-preview?school=${encodeURIComponent(state.school.id)}&grade=${encodeURIComponent(state.grade)}`;
    const task=module.getDocument({url:proxy,isEvalSupported:false});
    pdf=await task.promise;
    for(const target of targets){
      if(state.specialKey!==key||state.specialRenderId!==renderId)break;
      const pageNo=Number(target.dataset.specialPage);
      if(pageNo>pdf.numPages){target.textContent='Se illustrasjonen i original-PDF-en.';continue;}
      const page=await pdf.getPage(pageNo);
      const item=state.plan?.specialContent?.[Number(target.dataset.specialIndex)];
      const base=page.getViewport({scale:1});
      const isFull=state.expandedSpecial.has(Number(target.dataset.specialIndex));
      const availableWidth=Math.max(180,target.getBoundingClientRect().width-24||460);
      const adjustment=state.specialAdjustments.get(Number(target.dataset.specialIndex))||{horizontal:0,vertical:0};
      const geometry=isFull?fullPageGeometry(base.width,base.height,availableWidth,window.devicePixelRatio||1):
        visualCropGeometry(adjustableVisualRegion(item?.visualRegion,adjustment),base.width,base.height,availableWidth,window.devicePixelRatio||1);
      if(!geometry){target.textContent='Se illustrasjonen i original-PDF-en.';page.cleanup();continue;}
      const viewport=page.getViewport({scale:geometry.viewportScale});
      const canvas=document.createElement('canvas');
      canvas.width=geometry.pixelWidth;
      canvas.height=geometry.pixelHeight;
      canvas.style.width=`${geometry.cssWidth}px`;
      canvas.style.height=`${geometry.cssHeight}px`;
      const context=canvas.getContext('2d');
      if(!context)throw new Error('Nettleseren støtter ikke PDF-lerret');
      // PDF page remains the real source. Only the local topic bounding box is rendered.
      await page.render({canvasContext:context,viewport,transform:geometry.transform}).promise;
      page.cleanup();
      if(state.specialKey===key&&state.specialRenderId===renderId){target.replaceChildren(canvas);target.classList.add('special-rendered');}
    }
  }catch(error){
    if(state.specialKey!==key||state.specialRenderId!==renderId)return;
    for(const target of targets)if(!target.querySelector('canvas'))target.textContent='Bildet kunne ikke forhåndsvises. Åpne original-PDF-en via lenken.';
    console.warn('PDF-bildevisning utilgjengelig:',error?.message);
  }finally{if(pdf)try{await pdf.destroy();}catch{}}
}
function renderWeather(){
  const weatherDay=state.weather?.days?.[weekDayDate(state.day)];
  $('weather-icon').textContent=weatherDay?.icon||'🌤️';
  $('weather-temp').textContent=typeof weatherDay?.temperature==='number'?`${Math.round(weatherDay.temperature)} °C`:'— °C';
  $('weather-location').textContent=state.weather?.locationLabel||'Kristiansand-området · Meteorologisk institutt / Yr';
  $('weather-desc').textContent=weatherDay?`${weatherDay.description}${typeof weatherDay.rainMm==='number'?` · ca. ${weatherDay.rainMm} mm nedbør`:''}`:state.weatherError||'Ingen tilgjengelig prognose for valgt dag.';
  const rainy=Boolean(features.rainReminder&&weatherDay&&
    ((typeof weatherDay.rainMm==='number'&&weatherDay.rainMm>=0.8)||/rain|sleet|snow/.test(weatherDay.symbol||'')));
  $('rain-reminder').hidden=!rainy;
  $('rain-reminder').textContent=rainy?'☔ Regntøy kan være lurt å pakke for denne dagen.':'';
}
async function fetchJSON(url,timeoutMs=13000){
  const controller=new AbortController();const t=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{signal:controller.signal});
    const data=await response.json();if(!response.ok)throw new Error(data.warning||data.error||`Feil ${response.status}`);
    return data;
  }finally{clearTimeout(t);}
}
async function reload({quiet=false,statusOnly=quiet}={}){
  if(!state.grade||(statusOnly&&state.statusChecking))return;
  if(state.aiTimer){clearTimeout(state.aiTimer);state.aiTimer=null;}
  const id=++state.requestId;
  if(statusOnly){
    state.statusChecking=true;
    renderFeedback(); // Do not clear the displayed plan, status or elapsed AI time.
  }else{
    state.statusChecking=false;
  }
  if(!quiet){
    state.plan=null;state.planError=null;state.weather=null;state.weatherError=null;state.loading=true;
    renderContent();
  }
  const grade=state.grade,schoolId=state.school.id;
  // A status check never queues another AI job or re-runs the PDF parser.
  // Keep the regular plan URL unchanged for new loads and existing bookmarks.
  const requests=[statusOnly
    ?fetchJSON(state.plan?.jobId?`/api/ai-status?job=${encodeURIComponent(state.plan.jobId)}`:`/api/plan?school=${encodeURIComponent(schoolId)}&grade=${encodeURIComponent(grade)}&statusOnly=1${viewingNextWeek?'&nextWeek=1':''}`,12000)
    :fetchJSON(`/api/plan?school=${encodeURIComponent(schoolId)}&grade=${encodeURIComponent(grade)}${viewingNextWeek?'&nextWeek=1':''}`,60000)];
  if(features.weather&&!quiet)requests.push(fetchJSON(`/api/weather?school=${encodeURIComponent(schoolId)}`));
  const [plan,weather]=await Promise.allSettled(requests);
  if(statusOnly)state.statusChecking=false;
  if(id!==state.requestId||state.grade!==grade||state.school?.id!==schoolId)return;
  if(plan.status==='fulfilled'){
    let fresh=plan.value;
    // A ready AI-status response can hold older, unverified homework data.
    // Read the canonical cached plan through /api/plan, which validates PDF
    // columns and repairs any stale source deadlines before displaying it.
    if(statusOnly&&fresh.aiStatus==='ready'&&fresh.homeworkSourceVersion!==1){
      try{
        fresh=await fetchJSON(`/api/plan?school=${encodeURIComponent(schoolId)}&grade=${encodeURIComponent(grade)}${viewingNextWeek?'&nextWeek=1':''}`,60000);
      }catch(error){
        fresh={...fresh,homework:[],warning:'Leksefristene kunne ikke kontrolleres mot original-PDF-en. Åpne PDF-en for å se riktige frister.'};
      }
      if(id!==state.requestId||state.grade!==grade||state.school?.id!==schoolId)return;
    }
    if(statusOnly&&state.plan?.aiStatus==='processing'&&fresh.aiStatus==='processing'){
      // Preserve PDF metadata and the existing estimated progress timer.
    }else if(statusOnly&&state.plan?.aiStatus==='processing'&&fresh.aiStatus==='failed'){
      state.plan={...state.plan,aiStatus:'failed',warning:fresh.warning||'AI-analysen ble ikke fullført.'};
    }else state.plan=fresh;
  }else if(!quiet)state.planError='Kunne ikke hente ukeplan. Åpne trinnsiden, eller prøv igjen.';
  if(weather){if(weather.status==='fulfilled')state.weather=weather.value;else state.weatherError='Været er midlertidig utilgjengelig.';}
  else if(!quiet)state.weatherError='Værvisning er slått av.';
  state.loading=false;
  if(!quiet && !viewingNextWeek && !dayWasSelected && currentChoice().tryNextWeek && state.plan?.status!=='error'){
    // In weekends show next week only when an actual next-week PDF is published.
    const next=await fetchJSON(`/api/plan?school=${encodeURIComponent(schoolId)}&grade=${encodeURIComponent(grade)}&nextWeek=1`,60000).catch(()=>null);
    if(id!==state.requestId||state.grade!==grade||state.school?.id!==schoolId)return;
    // Keep homework progress in its real school-week namespace; reject stale nextWeek responses.
    const nextCalendar=schoolCalendar(new Date(Date.now()+7*86400000),siteConfig.school.timezone);
    if(next?.pdf && next.status!=='unpublished' && next.status!=='unavailable' &&
       next.week===nextCalendar.week && next.year===nextCalendar.year){
      viewingNextWeek=true;calendar=nextCalendar;
      state.day=0;state.plan=next;
      renderShell();
    }
  }
  renderContent();
  // Keep the rule-based view visible until the background AI result is ready.
  if(state.plan?.aiStatus==='processing'&&state.aiPolls<240){
    state.aiPolls++;
    state.aiTimer=setTimeout(()=>{
      state.aiTimer=null;
      if(state.grade===grade&&state.school?.id===schoolId&&state.requestId===id)reload({quiet:true,statusOnly:true});
    },3000);
  }else state.aiPolls=0;
}
function cancelRequests(){
  if(state.aiTimer)clearTimeout(state.aiTimer);
  state.aiTimer=null;state.aiPolls=0;state.requestId++;state.statusChecking=false;
  if(state.analysisTicker)clearInterval(state.analysisTicker);
  state.analysisTicker=null;state.analysisStartedAt=null;
}
function selectSchool(id,{restore=false}={}){
  if(!validSchool(id,siteConfig.schools))return;
  primaryView="plan";
  cancelRequests();state.profileId=null;state.school=siteConfig.schools[id];state.grade=null;
  state.availableGrades=null;state.gradeError=null;
  state.plan=null;state.planError=null;state.weather=null;state.weatherError=null;
  storageWrite(schoolSelectionKey(),id);
  renderShell();
  if(!restore)scrollNewViewToTop();
  loadSchoolGrades(id,restore);
  if(!restore)recordNavigation();
}
async function loadSchoolGrades(schoolId,restore=false){
  const requestId=state.requestId;
  try{
    const data=await fetchJSON(`/api/grades?school=${encodeURIComponent(schoolId)}`,26000);
    if(state.requestId!==requestId||state.school?.id!==schoolId)return;
    state.availableGrades=Array.isArray(data.grades)?data.grades:[];
    state.gradeError=data.warning||null;
    const remembered=storageRead(gradeSelectionKey(schoolId));
    if(restore&&state.availableGrades.some(g=>g.code===remembered)){selectGrade(remembered);return;}
  }catch(error){
    if(state.requestId!==requestId||state.school?.id!==schoolId)return;
    state.gradeError='Kunne ikke hente klassetrinn. Prøv å velge skolen på nytt, eller åpne skolens nettside.';
    state.availableGrades=[];
  }
  renderShell();
}
function clearSchool(){
  cancelRequests();state.profileId=null;state.school=null;state.grade=null;state.availableGrades=null;state.gradeError=null;
  state.plan=null;state.planError=null;state.weather=null;state.weatherError=null;
  storageDrop(schoolSelectionKey());
  $('school-search').value='';renderSchoolChoices();renderShell();
  recordNavigation();scrollNewViewToTop();
}
function selectGrade(grade){
  if(!state.school||!state.availableGrades?.some(g=>g.code===grade))return;
  primaryView="plan";
  storageWrite(gradeSelectionKey(state.school.id),grade);
  const choice=currentChoice();
  viewingNextWeek=false;dayWasSelected=false;calendar=schoolCalendar(new Date(),siteConfig.school.timezone);
  state.aiPolls=0;state.profileId=null;state.grade=grade;state.day=choice.day;
  renderShell();recordNavigation();scrollNewViewToTop();reload();
}
function clearGrade(){
  cancelRequests();state.profileId=null;state.grade=null;state.plan=null;state.weather=null;state.planError=null;
  storageDrop(gradeSelectionKey(state.school.id));renderShell();recordNavigation();
  scrollNewViewToTop();
}
async function showBuildVersion(){
  const node=$('git-version');
  if(!node)return;
  try{
    const response=await fetch('/build-info.json',{cache:'no-store'});
    if(!response.ok)throw new Error('Build metadata unavailable');
    const info=await response.json();
    if(!/^[a-f0-9]{7,40}$/i.test(info.commit||''))return;
    const id=info.commit.toLowerCase();
    node.textContent='Git '+id.slice(0,8);
    node.href='https://github.com/morronetlab/fagerholt/commit/'+id;
    node.hidden=false;
  }catch{node.hidden=true;}
}
function openFamilyProfile(profile,{upcoming=false,cachedPlan=null,record=true}={}){
  primaryView="plan";
  const school=siteConfig.schools[profile.school];
  if(!school)return;
  cancelRequests();
  state.school=school;state.grade=profile.grade;state.profileId=profile.id;
  state.availableGrades=[{code:profile.grade}];state.gradeError=null;
  // A source-verified AI plan is already available from the family dashboard.
  // Render it immediately: do not show the loading screen or repeat /api/plan.
  const initial= cachedPlan?.aiStatus==='ready'&&cachedPlan?.parser==='ai'&&
   cachedPlan.homeworkSourceVersion===1&&cachedPlan.status==='ok' ? cachedPlan:null;
  state.plan=initial;state.loading=!initial;state.planError=null;
  state.weather=null;state.weatherError=null;
  viewingNextWeek=upcoming;dayWasSelected=upcoming;
  calendar=schoolCalendar(new Date(Date.now()+(upcoming?7*86400_000:0)),school.timezone);
  state.day=upcoming?0:currentChoice().day;state.aiPolls=0;
  storageWrite(schoolSelectionKey(),profile.school);
  storageWrite(gradeSelectionKey(profile.school),profile.grade);
  familyUI.leave();
  renderShell();
  if(record)recordNavigation();
  scrollNewViewToTop();
  if(!initial){reload();return;}
  if(features.weather){
   const requestId=state.requestId;
   void fetchJSON('/api/weather?school='+encodeURIComponent(profile.school)).then(weather=>{
    if(state.requestId===requestId&&state.profileId===profile.id&&!familyUI.isActive()){
     state.weather=weather;renderWeather();
    }
   }).catch(()=>{ /* Weather is optional and must not block the cached week plan. */ });
  }
}
function restoreNavigation(target){
 if(!target||target[NAV_KEY]!==true)return;
 restoringRoute=true;
 try{
  if(target.view==='family'){navigateTo('family',{record:false});return;}
  if(target.view==='welcome'){navigateTo('welcome',{record:false});return;}
  if(target.view!=='plan')return;
  if(familyUI.isActive())familyUI.leave();
  primaryView='plan';
  const school=target.school&&siteConfig.schools[target.school];
  if(!school){
   cancelRequests();state.school=null;state.grade=null;state.profileId=null;
   state.plan=null;state.availableGrades=null;renderShell();return;
  }
  const profile=target.profileId?familyUI.profileById(target.profileId):null;
  if(profile&&profile.school===target.school&&profile.grade===target.grade){
   openFamilyProfile(profile,{upcoming:Boolean(target.upcoming),
    cachedPlan:familyUI.cachedReadyPlan(profile.id),record:false});
   if(Number.isInteger(target.day)&&target.day>=0&&target.day<=4){
    state.day=target.day;renderShell();
   }
   return;
  }
  const oldSchool=state.school?.id,oldGrade=state.grade;
  state.school=school;state.grade=target.grade||null;state.profileId=null;
  state.availableGrades=state.grade?[{code:state.grade}]:
   oldSchool===school.id?state.availableGrades:null;
  viewingNextWeek=Boolean(target.upcoming);
  calendar=schoolCalendar(new Date(Date.now()+(viewingNextWeek?7*86400_000:0)),school.timezone);
  state.day=Number.isInteger(target.day)&&target.day>=0&&target.day<=4?target.day:calendar.weekday;
  dayWasSelected=true;
  if(oldSchool!==school.id||oldGrade!==state.grade||
    state.plan?.week!==calendar.week||state.plan?.year!==calendar.year){
   cancelRequests();state.plan=null;state.planError=null;
  }
  renderShell();
  if(state.grade&&!state.plan)void reload();
  else if(!state.grade&&!state.availableGrades)void loadSchoolGrades(school.id);
 }finally{restoringRoute=false;scrollNewViewToTop();}
}
function boot(){
  const issueReporter=initIssueReporter();
  familyUI=initFamilyUI({
   onModeChange:()=>{renderShell();recordNavigation();scrollNewViewToTop();},
   onOpenProfile:openFamilyProfile,
   onReportIssue:args=>issueReporter.open(args),
   onOpenSingle:()=>{primaryView='plan';renderShell();recordNavigation();scrollNewViewToTop();}
  });
  accountUI=initAccountUI({familyUI,onGoFamily:()=>navigateTo('family')});
  if('scrollRestoration' in history)history.scrollRestoration='manual';
  window.addEventListener('popstate',event=>restoreNavigation(event.state));
  $('home-link').addEventListener('click',e=>{e.preventDefault();navigateTo('welcome');});
  $('nav-home').addEventListener('click',()=>navigateTo('welcome'));
  $('nav-plan').addEventListener('click',()=>navigateTo('plan'));
  $('family-toggle').addEventListener('click',()=>navigateTo(familyUI.isActive()?'plan':'family'));
  $('landing-create-family').addEventListener('click',()=>accountUI.open());
  $('landing-open-plan').addEventListener('click',()=>navigateTo('plan'));
  $('landing-local-family').addEventListener('click',()=>{
    navigateTo('family');
    $('family-add').click();
  });
  $('school-back').addEventListener('click',()=>navigateTo('welcome'));
  $('grade-back').addEventListener('click',()=>{clearSchool();$('school-search').focus();});
  initHomeworkHelper();
  initWordQuiz();
  $('back-this-week').addEventListener('click',()=>{viewingNextWeek=false;dayWasSelected=true;calendar=schoolCalendar(new Date(),siteConfig.school.timezone);state.day=calendar.weekday;renderShell();recordNavigation();scrollNewViewToTop();reload();});
  void showBuildVersion();
  document.title=`${brand.title} · Kristiansand`;
  document.documentElement.style.setProperty('--brand',brand.color);
  document.documentElement.style.setProperty('--accent',brand.accent);
  $('brand-title').textContent=brand.title;
  if (brand.title.toLocaleLowerCase('nb-NO') === 'skoleuka') $('brand-title').innerHTML='skole<span class="logo-accent">uka.</span>';
  $('brand-subtitle').textContent=brand.subtitle.toLocaleUpperCase('nb-NO');
  $('gate-school').textContent='';
  $('footer-school').textContent='Kristiansand';
  $('today').textContent=new Date().toLocaleDateString('nb-NO',{timeZone:siteConfig.school.timezone,weekday:'long',day:'numeric',month:'long'});
  $('week-label').textContent=`UKE ${calendar.week}`;
  $('welcome-week-number').textContent='Uke '+calendar.week;
  renderSchoolChoices();
  $('school-search').addEventListener('input',e=>renderSchoolChoices(e.target.value));
  document.addEventListener('click',e=>{
    const selectedSchool=e.target.closest('[data-school]');if(selectedSchool){selectSchool(selectedSchool.dataset.school);return;}
    const grade=e.target.closest('[data-grade]');if(grade){selectGrade(grade.dataset.grade);return;}
    const day=e.target.closest('[data-day]');if(day){dayWasSelected=true;state.day=Number(day.dataset.day);renderShell();recordNavigation('replace');return;}
    const tutor=e.target.closest('[data-helper-task]');if(tutor){
      const item=expandHomework(state.plan?.homework||[])[Number(tutor.dataset.helperTask)];
      if(item)openHomeworkHelper({text:item.text,subject:item.subject,grade:state.grade});
      return;
    }
    if(e.target.closest('#undo-mission'))setChecked('mission',0,'all',false);
    const widen=e.target.closest('[data-special-widen]');if(widen){
      const index=Number(widen.dataset.specialIndex),axis=widen.dataset.specialWiden;
      const adjustments=state.specialAdjustments.get(index)||{horizontal:0,vertical:0};
      if(['horizontal','vertical'].includes(axis))adjustments[axis]=Math.min(4,adjustments[axis]+1);
      state.specialAdjustments.set(index,adjustments);
      widen.disabled=adjustments[axis]>=4;
      if(state.specialKey)void renderSpecialPdfPages(state.specialKey);
      return;
    }
    const show=e.target.closest('[data-special-expand]');if(show){
      const index=Number(show.dataset.specialExpand);
      if(state.expandedSpecial.has(index))state.expandedSpecial.delete(index);else state.expandedSpecial.add(index);
      const expanded=state.expandedSpecial.has(index);
      show.setAttribute('aria-expanded',String(expanded));
      show.textContent=expanded?'↙ Vis utsnittet':'↗ Vis hele PDF-siden';
      if(state.specialKey)void renderSpecialPdfPages(state.specialKey);
    }
  });
  document.addEventListener('change',e=>{
    const el=e.target.closest('input[data-check]');if(el)setChecked(el.dataset.check,el.dataset.index,el.dataset.progressDay,el.checked);
  });
  $('plan-back-family').addEventListener('click',()=>navigateTo('family'));
  $('change-grade').addEventListener('click',clearGrade);
  $('change-school').addEventListener('click',clearSchool);
  $('mobile-change-grade').addEventListener('click',()=>{$('mobile-selection-menu').open=false;clearGrade();});
  $('mobile-change-school').addEventListener('click',()=>{$('mobile-selection-menu').open=false;clearSchool();});
  $('weather-toggle').addEventListener('click',()=>{
    const expanded=$('weather-panel').classList.toggle('is-expanded');
    $('weather-toggle').setAttribute('aria-expanded',String(expanded));
  });
  const reportCurrentPlan=()=>{
    if(!state.school?.id||!state.grade)return;
    issueReporter.open({contexts:[{school:state.school.id,grade:state.grade,
     year:state.plan?.year||calendar.year,week:state.plan?.week||calendar.week,
     pdf:state.plan?.pdf||null}],kind:'wrong_interpretation'});
  };
  $('report-plan-issue').addEventListener('click',reportCurrentPlan);
  $('feedback-report-issue').addEventListener('click',reportCurrentPlan);
  $('reload').addEventListener('click',reload);
  $('feedback-retry').addEventListener('click',()=>state.plan?.aiStatus==='processing'?reload({quiet:true,statusOnly:true}):reload());
  const savedSchool=storageRead(schoolSelectionKey());
  if(familyUI.hasProfiles()){primaryView='plan';familyUI.enter();}
  else if(validSchool(savedSchool,siteConfig.schools)){primaryView='plan';selectSchool(savedSchool,{restore:true});}
  else renderShell();
  navigationReady=true;
  // The first entry is the in-app starting point. Later internal steps are
  // pushed, so the native browser Back button returns to the prior app view.
  try{history.replaceState(navigationSnapshot(),' ',location.href);}catch{}
  // If a tablet or fridge display stays open, refresh on week/date rollover.
  setInterval(()=>{
    const next=schoolCalendar(new Date(),siteConfig.school.timezone);
    // Respect the selected upcoming week until it becomes the current week.
    const target=viewingNextWeek?
      schoolCalendar(new Date(Date.now()+7*86400_000),siteConfig.school.timezone):next;
    const upcomingNowCurrent=viewingNextWeek&&next.week===calendar.week&&next.year===calendar.year;
    if(upcomingNowCurrent||target.week!==calendar.week||target.year!==calendar.year||
       (!viewingNextWeek&&target.today!==calendar.today)){
      calendar=upcomingNowCurrent?next:target;
      if(upcomingNowCurrent)viewingNextWeek=false;
      dayWasSelected=false;state.day=viewingNextWeek?0:currentChoice().day;
      $('week-label').textContent=`UKE ${calendar.week}`;
      $('welcome-week-number').textContent='Uke '+next.week;
      $('today').textContent=new Date().toLocaleDateString('nb-NO',{timeZone:siteConfig.school.timezone,weekday:'long',day:'numeric',month:'long'});
      if(familyUI?.isActive()){renderShell();familyUI.refresh();}
      else if(state.grade){renderShell();reload();}
    }else if(familyUI?.isActive())familyUI.refresh();
    else if(state.grade)reload();
  },60*60*1000);
}
boot();
