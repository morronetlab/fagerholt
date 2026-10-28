import {siteConfig} from './site-config.mjs';
import {schoolCalendar,dayDate,DAYS} from './shared/calendar.mjs';
import {schoolSelectionKey,validSchool,gradeSelectionKey,validGrade,progressKey} from './shared/selection.mjs';
import {planFeedback} from './shared/plan-feedback.mjs';
import {normalizeVisualRegion,adjustableVisualRegion,visualCropGeometry,fullPageGeometry} from './shared/visual-region.mjs';
import {homeworkProgress} from './shared/group-scope.mjs';
import {dueDayLabel,displayEvent,packingText} from './shared/plan-display.mjs';
// This module is served from public/. Calendar and selection modules are mirrored in public/shared/.
const $ = id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const {brand,features}=siteConfig;
let calendar=schoolCalendar(new Date(),siteConfig.school.timezone);
const storageRead=(key)=>{try{return localStorage.getItem(key);}catch{return null;}};
const storageWrite=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
const storageDrop=(key)=>{try{localStorage.removeItem(key);}catch{}};
const state={school:null,grade:null,availableGrades:null,gradeError:null,day:calendar.weekday,plan:null,loading:false,weather:null,weatherError:null,planError:null,requestId:0,aiPolls:0,aiTimer:null,analysisStartedAt:null,analysisTicker:null,specialKey:null,specialRenderId:0,expandedSpecial:new Set(),specialAdjustments:new Map()};
const weekDayDate=day=>dayDate(calendar.year,calendar.week,day);
const titleDay=day=>new Date(`${weekDayDate(day)}T12:00:00Z`).toLocaleDateString('nb-NO',{timeZone:'UTC',day:'numeric',month:'short'});
const progress=(section,day='all')=>progressKey(state.school.id,state.grade,calendar.year,calendar.week,section,day);
function isChecked(section,index,day='all'){
  try{return Boolean(JSON.parse(storageRead(progress(section,day))||'{}')[index]);}catch{return false;}
}
function setChecked(section,index,day,checked){
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
  const hasSchool=Boolean(state.school),chosen=Boolean(state.grade&&hasSchool);
  $('school-gate').hidden=hasSchool;
  $('grade-gate').hidden=!hasSchool||chosen;
  $('app-view').hidden=!chosen;
  $('change-school').hidden=!hasSchool;
  $('change-grade').hidden=!chosen;
  $('footer-school').textContent=state.school?.name||'Kristiansand';
  if(!hasSchool)return;
  if(!chosen){
    $('gate-school').textContent=state.school.name;
    renderGradeChoices();
    return;
  }
  $('school-name').textContent=`${state.school.name.toLocaleUpperCase('nb-NO')} · ${state.grade}. KLASSE`;
  $('welcome-description').textContent=`Se hva som skjer i ${state.grade}. klasse, og kryss av det du har gjort.`;
  $('school-source').href=state.plan?.source||state.school.grades?.[state.grade]||state.school.homepage;
  $('day-buttons').innerHTML=DAYS.map((d,i)=>`<button type="button" class="day ${i===state.day?'active':''} ${i<calendar.weekday?'past':''}" data-day="${i}" aria-current="${i===state.day?'date':'false'}"><span>${safe(d)}</span><strong>${titleDay(i)}</strong></button>`).join('');
  renderContent();
}
function groupBadge(group){
  if(!group)return '';
  const color=/rød/i.test(group)?'group-red':/grønn/i.test(group)?'group-green':/blå/i.test(group)?'group-blue':'group-class';
  return `<span class="group-badge ${color}">${safe(group)}</span>`;
}
function checklist(items,section,day='all'){
  return items.map((item,i)=>{
    const label=typeof item==='string'?item:(item?.text||item?.label||'');
    const due=section==='homework'?dueDayLabel(item):null;
    const meta=typeof item==='object'&&item?.subject&&!(due&&item.subject.toLowerCase()===due.toLowerCase())?`<span class="subject">${safe(item.subject)}</span>`:'';
    const hint=section==='bag'&&item?.note?`<small>${safe(item.note)}</small>`:'';
    const dueBadge=due?`<span class="homework-due">📅 ${safe(due)}</span>`:'';
    const displayLabel=section==='bag'?packingText(label):label;
    return `<label class="checkrow ${isChecked(section,i,day)?'done':''}"><input type="checkbox" data-check="${section}" data-index="${i}" data-progress-day="${day}" ${isChecked(section,i,day)?'checked':''}><span class="checktext">${groupBadge(item?.group)}${dueBadge}${meta}${safe(displayLabel)}${hint}</span></label>`;
  }).join('');
}
function empty(msg){return `<p class="empty"><span aria-hidden="true">ℹ️</span> ${safe(msg)}</p>`;}
function renderFeedback(){
  const info=planFeedback({school:state.school,grade:state.grade,plan:state.plan,error:state.planError});
  const el=$('plan-feedback');
  el.hidden=!info;
  $('plan-body').hidden=Boolean(info?.hideContent);
  if(!info)return;
  el.className=`plan-feedback ${info.kind==='analyzing'?'feedback-analyzing':info.kind==='partial'?'feedback-partial':'feedback-missing'}`;
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
  $('feedback-retry').hidden=!info.showRetry;
  $('feedback-retry').textContent=info.kind==='analyzing'?'↻ Sjekk AI-status':'↻ Prøv igjen';
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
 $('analysis-time-hint').textContent=elapsed>=180?'Dette tar lenger tid enn vanlig. Du kan sjekke AI-status på nytt.':'Vi sjekker automatisk når planen er ferdig. Det kan ta et par minutter.';
 if(!state.analysisTicker)state.analysisTicker=setInterval(updateAnalysisClock,1000);
}
function renderContent(){
  if(!state.grade)return;
  const p=state.plan;
  const status=state.loading?'loading':state.planError?'error':p?.status||'loading';
  $('status-pill').textContent=p?.aiStatus==='processing'?'AI analyserer · foreløpig ukeplan':p?.status==='partial'?'Ukeplan delvis tolket':p?.status==='unreadable'?'PDF kunne ikke tolkes':p?.aiStatus==='ready'?'AI-tolket ukeplan':p?.aiStatus==='failed'?'AI-feil · foreløpig ukeplan':badge(status);
  $('status-pill').className='state-pill '+(p?.aiStatus==='processing'?'state-ai-processing':p?.aiStatus==='ready'?'state-ai-ready':['error','unreadable'].includes(status)?'state-error':['partial','unpublished','unavailable'].includes(status)?'state-warning':'');
  renderFeedback();
  const pending=p?.aiStatus==='processing';
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
  const events=p?.days?.[DAYS[state.day]]?.events||[];
  const groups=[...new Set([...events,...getBag()].map(x=>x.group).filter(Boolean))];
  $('day-group-summary').hidden=!groups.length;
  $('day-group-summary').innerHTML=groups.length?`<strong>Husk riktig gruppe denne dagen:</strong> ${groups.map(groupBadge).join(' ')}`:'';
  $('day-program').innerHTML=p?.status==='unpublished'?empty('Ingen ukeplan publisert for denne uken.'):
    events.length?events.map(x=>{const e=displayEvent(x);return `<div class="event"><span class="event-dot">●</span><span>${groupBadge(x.group)}${e.time?`<small>${safe(e.time)}</small>`:''}${safe(e.title)}${e.endTime?`<small class="event-endtime">${safe(e.endTime)}</small>`:''}</span></div>`;}).join(''):
    empty(state.loading?'Henter dagsprogram …':(p?.status==='ok'&&p?.parser==='ai'?'Ingen dagsprogram er oppgitt for denne dagen.':'Ingen dagsprogram kunne tolkes sikkert. Sjekk original-PDF.'));
  const bag=getBag();
  $('bag-list').innerHTML=bag.length?checklist(bag,'bag',DAYS[state.day]):empty(state.loading?'Henter pakkelisten …':'Ingen spesifikk pakkeliste ble funnet i PDF-en.');
  const hw=p?.homework||[];
  $('homework-list').innerHTML=hw.length?checklist(hw,'homework'):empty(state.loading?'Henter lekser …':'Ingen lekser ble funnet i PDF-en.');
  renderHomeworkProgress(hw);
  const hasTheme=features.theme&&Boolean(p?.weekTheme);
  const subjects=Array.isArray(p?.subjects)?p.subjects:[];
  const missionText=features.optionalMission?(p?.optionalMission||''):'';
  const isSuggestedMission=Boolean(missionText&&!p?.optionalMission);
  const hasMission=Boolean(missionText);
  $('theme-panel').hidden=!(hasTheme||hasMission);
  $('subjects-panel').hidden=!subjects.length;
  $('subjects-list').innerHTML=subjects.map(x=>`<p class="subject-item">${safe(x)}</p>`).join('');
  $('theme-content').hidden=!hasTheme;$('theme-content').textContent=p?.weekTheme||'';
  $('mission-slot').innerHTML=(!hasMission?'':
    isChecked('mission',0)?`<button type="button" class="mission-done" id="undo-mission">✓ Frivillig oppdrag fullført · Vis igjen</button>`:
    `<div class="mission"><div><strong>🌟 Frivillig oppdrag ${isSuggestedMission?'· forslag fra Ukeplanen':''}</strong><p>${safe(missionText)}</p></div><label class="mission-check"><input type="checkbox" data-check="mission" data-index="0" data-progress-day="all"> Fullført</label></div>`);
  const notices=p?.notices||[];
  $('notices-count').textContent=notices.length?notices.length:'';
  $('notices-list').innerHTML=notices.length?notices.map(x=>`<p>${groupBadge(x?.group)}${safe(typeof x==='string'?x:x?.text||x?.detail||x?.title)}</p>`).join(''):empty('Ingen beskjeder ble funnet i PDF-en.');
  const goals=features.learningGoals?p?.learningGoals||[]:[];
  $('goals-panel').hidden=!features.learningGoals||!goals.length;
  $('goals-count').textContent=goals.length;
  $('goals-list').innerHTML=goals.map(x=>`<p>${groupBadge(x?.group)}${safe(typeof x==='string'?x:x?.text||x?.detail||'')}</p>`).join('');
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
async function reload({quiet=false}={}){
  if(!state.grade)return;
  if(state.aiTimer){clearTimeout(state.aiTimer);state.aiTimer=null;}
  const id=++state.requestId;
  if(!quiet){
    state.plan=null;state.planError=null;state.weather=null;state.weatherError=null;state.loading=true;
    renderContent();
  }
  const grade=state.grade,schoolId=state.school.id;
  // Week-plan PDFs may be several MB; do not cancel the client before the server timeout.
  const requests=[fetchJSON(`/api/plan?school=${encodeURIComponent(schoolId)}&grade=${encodeURIComponent(grade)}`,60000)];
  if(features.weather&&!quiet)requests.push(fetchJSON(`/api/weather?school=${encodeURIComponent(schoolId)}`));
  const [plan,weather]=await Promise.allSettled(requests);
  if(id!==state.requestId||state.grade!==grade||state.school?.id!==schoolId)return;
  if(plan.status==='fulfilled')state.plan=plan.value;
  else if(!quiet)state.planError='Kunne ikke hente ukeplan. Åpne trinnsiden, eller prøv igjen.';
  if(weather){if(weather.status==='fulfilled')state.weather=weather.value;else state.weatherError='Været er midlertidig utilgjengelig.';}
  else if(!quiet)state.weatherError='Værvisning er slått av.';
  state.loading=false;
  renderContent();
  // Keep the rule-based view visible until the background AI result is ready.
  if(state.plan?.aiStatus==='processing'&&state.aiPolls<20){
    state.aiPolls++;
    state.aiTimer=setTimeout(()=>{
      state.aiTimer=null;
      if(state.grade===grade&&state.school?.id===schoolId&&state.requestId===id)reload({quiet:true});
    },15000);
  }else state.aiPolls=0;
}
function cancelRequests(){
  if(state.aiTimer)clearTimeout(state.aiTimer);
  state.aiTimer=null;state.aiPolls=0;state.requestId++;
  if(state.analysisTicker)clearInterval(state.analysisTicker);
  state.analysisTicker=null;state.analysisStartedAt=null;
}
function selectSchool(id,{restore=false}={}){
  if(!validSchool(id,siteConfig.schools))return;
  cancelRequests();state.school=siteConfig.schools[id];state.grade=null;
  state.availableGrades=null;state.gradeError=null;
  state.plan=null;state.planError=null;state.weather=null;state.weatherError=null;
  storageWrite(schoolSelectionKey(),id);
  renderShell();
  loadSchoolGrades(id,restore);
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
  cancelRequests();state.school=null;state.grade=null;state.availableGrades=null;state.gradeError=null;
  state.plan=null;state.planError=null;state.weather=null;state.weatherError=null;
  storageDrop(schoolSelectionKey());
  $('school-search').value='';renderSchoolChoices();renderShell();
}
function selectGrade(grade){
  if(!state.school||!state.availableGrades?.some(g=>g.code===grade))return;
  storageWrite(gradeSelectionKey(state.school.id),grade);
  state.aiPolls=0;state.grade=grade;state.day=calendar.weekday;renderShell();reload();
}
function clearGrade(){
  cancelRequests();state.grade=null;state.plan=null;state.weather=null;state.planError=null;
  storageDrop(gradeSelectionKey(state.school.id));renderShell();
}
function boot(){
  document.title=`${brand.title} · Kristiansand`;
  document.documentElement.style.setProperty('--brand',brand.color);
  document.documentElement.style.setProperty('--accent',brand.accent);
  $('brand-title').textContent=brand.title;
  if (brand.title.toLocaleLowerCase('nb-NO') === 'ukeplanen') $('brand-title').innerHTML='uke<span class="logo-accent">planen.</span>';
  $('brand-subtitle').textContent=brand.subtitle.toLocaleUpperCase('nb-NO');
  $('gate-school').textContent='';
  $('footer-school').textContent='Kristiansand';
  $('today').textContent=new Date().toLocaleDateString('nb-NO',{timeZone:siteConfig.school.timezone,weekday:'long',day:'numeric',month:'long'});
  $('week-label').textContent=`UKE ${calendar.week}`;
  renderSchoolChoices();
  $('school-search').addEventListener('input',e=>renderSchoolChoices(e.target.value));
  document.addEventListener('click',e=>{
    const selectedSchool=e.target.closest('[data-school]');if(selectedSchool){selectSchool(selectedSchool.dataset.school);return;}
    const grade=e.target.closest('[data-grade]');if(grade){selectGrade(grade.dataset.grade);return;}
    const day=e.target.closest('[data-day]');if(day){state.day=Number(day.dataset.day);renderShell();return;}
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
  $('change-grade').addEventListener('click',clearGrade);
  $('change-school').addEventListener('click',clearSchool);
  $('reload').addEventListener('click',reload);
  $('feedback-retry').addEventListener('click',()=>reload());
  const savedSchool=storageRead(schoolSelectionKey());
  if(validSchool(savedSchool,siteConfig.schools))selectSchool(savedSchool,{restore:true});
  else renderShell();
  // If a tablet or fridge display stays open, refresh on week/date rollover.
  setInterval(()=>{
    const next=schoolCalendar(new Date(),siteConfig.school.timezone);
    if(next.today!==calendar.today||next.week!==calendar.week||next.year!==calendar.year){
      calendar=next;state.day=next.weekday;
      $('week-label').textContent=`UKE ${next.week}`;
      $('today').textContent=new Date().toLocaleDateString('nb-NO',{timeZone:siteConfig.school.timezone,weekday:'long',day:'numeric',month:'long'});
      if(state.grade){renderShell();reload();}
    }else if(state.grade)reload();
  },60*60*1000);
}
boot();
