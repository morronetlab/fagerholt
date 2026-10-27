import {siteConfig} from './site-config.mjs';
import {schoolCalendar,dayDate,DAYS} from './shared/calendar.mjs';
import {gradeSelectionKey,validGrade,progressKey} from './shared/selection.mjs';
// This module is served from public/. Calendar and selection modules are mirrored in public/shared/.
const $ = id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const {school,brand,features}=siteConfig;
let calendar=schoolCalendar(new Date(),school.timezone);
const storageRead=(key)=>{try{return localStorage.getItem(key);}catch{return null;}};
const storageWrite=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
const storageDrop=(key)=>{try{localStorage.removeItem(key);}catch{}};
const state={grade:null,day:calendar.weekday,plan:null,loading:false,weather:null,weatherError:null,planError:null,requestId:0};
const weekDayDate=day=>dayDate(calendar.year,calendar.week,day);
const titleDay=day=>new Date(`${weekDayDate(day)}T12:00:00Z`).toLocaleDateString('nb-NO',{timeZone:'UTC',day:'numeric',month:'short'});
const progress=(section,day='all')=>progressKey(school.id,state.grade,calendar.year,calendar.week,section,day);
function isChecked(section,index,day='all'){
  try{return Boolean(JSON.parse(storageRead(progress(section,day))||'{}')[index]);}catch{return false;}
}
function setChecked(section,index,day,checked){
  const key=progress(section,day);
  let data={};try{data=JSON.parse(storageRead(key)||'{}')||{};}catch{}
  data[index]=checked;storageWrite(key,JSON.stringify(data));renderContent();
}
function badge(status){
  return ({loading:'Henter ukeplan …',ok:'Ukeplan hentet',partial:'Delvis tolket PDF',unreadable:'PDF kunne ikke tolkes',unpublished:'Ikke publisert ennå',error:'Ukeplan utilgjengelig'})[status]||'Ukeplan';
}
function getBag(){
  const p=state.plan;if(!p)return [];
  const raw=[...(p.everyday||[]),...(p.days?.[DAYS[state.day]]?.bring||[])].filter(x=>x&&typeof x.label==='string');
  return [...new Map(raw.map(x=>[x.label.toLocaleLowerCase('nb-NO'),x])).values()];
}
function renderGradeChoices(){
  $('grade-choices').innerHTML=Object.keys(school.grades).map(k=>`<button type="button" class="grade" data-grade="${safe(k)}"><strong>${safe(k)}.</strong><span>klasse</span></button>`).join('');
}
function renderShell(){
  const chosen=Boolean(state.grade);
  $('grade-gate').hidden=chosen;$('app-view').hidden=!chosen;$('change-grade').hidden=!chosen;
  if(!chosen)return;
  $('school-name').textContent=`${school.name.toLocaleUpperCase('nb-NO')} · ${state.grade}. KLASSE`;
  $('welcome-description').textContent=`Se hva som skjer i ${state.grade}. klasse, og kryss av det du har gjort.`;
  $('school-source').href=school.grades[state.grade];
  $('day-buttons').innerHTML=DAYS.map((d,i)=>`<button type="button" class="day ${i===state.day?'active':''} ${i<calendar.weekday?'past':''}" data-day="${i}" aria-current="${i===state.day?'date':'false'}"><span>${safe(d)}</span><strong>${titleDay(i)}</strong></button>`).join('');
  renderContent();
}
function checklist(items,section,day='all'){
  return items.map((item,i)=>{
    const label=typeof item==='string'?item:(item?.text||item?.label||'');
    const meta=typeof item==='object'&&item?.subject?`<span class="subject">${safe(item.subject)}</span>`:'';
    return `<label class="checkrow ${isChecked(section,i,day)?'done':''}"><input type="checkbox" data-check="${section}" data-index="${i}" data-progress-day="${day}" ${isChecked(section,i,day)?'checked':''}><span class="checktext">${meta}${safe(label)}</span></label>`;
  }).join('');
}
function empty(msg){return `<p class="empty"><span aria-hidden="true">ℹ️</span> ${safe(msg)}</p>`;}
function renderContent(){
  if(!state.grade)return;
  const p=state.plan;
  const status=state.loading?'loading':state.planError?'error':p?.status||'loading';
  $('status-pill').textContent=badge(status);
  $('status-pill').className='state-pill '+(['error','unreadable'].includes(status)?'state-error':['partial','unpublished'].includes(status)?'state-warning':'');
  const msg=state.planError||p?.warning;
  $('warning-area').hidden=!msg;
  $('warning-area').textContent=msg||'';
  $('pdf-source').hidden=!p?.pdf;if(p?.pdf)$('pdf-source').href=p.pdf;
  const events=p?.days?.[DAYS[state.day]]?.events||[];
  $('day-program').innerHTML=p?.status==='unpublished'?empty('Ingen ukeplan publisert for denne uken.'):
    events.length?events.map(x=>`<div class="event"><span class="event-dot">●</span><span>${x.time?`<small>${safe(x.time)}</small>`:''}${safe(x.title)}</span></div>`).join(''):
    empty(state.loading?'Henter dagsprogram …':'Ingen dagsprogram kunne tolkes sikkert. Sjekk original-PDF.');
  const bag=getBag();
  $('bag-list').innerHTML=bag.length?checklist(bag,'bag',DAYS[state.day]):empty(state.loading?'Henter pakkelisten …':'Ingen spesifikk pakkeliste ble funnet i PDF-en.');
  const hw=p?.homework||[];
  $('homework-list').innerHTML=hw.length?checklist(hw,'homework'):empty(state.loading?'Henter lekser …':'Ingen lekser ble funnet i PDF-en.');
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
  $('notices-list').innerHTML=notices.length?notices.map(x=>`<p>${safe(typeof x==='string'?x:x?.detail||x?.title)}</p>`).join(''):empty('Ingen beskjeder ble funnet i PDF-en.');
  const goals=features.learningGoals?p?.learningGoals||[]:[];
  $('goals-panel').hidden=!features.learningGoals||!goals.length;
  $('goals-count').textContent=goals.length;
  $('goals-list').innerHTML=goals.map(x=>`<p>${safe(typeof x==='string'?x:x?.text||x?.detail||'')}</p>`).join('');
  renderWeather();
}
function renderWeather(){
  const weatherDay=state.weather?.days?.[weekDayDate(state.day)];
  $('weather-icon').textContent=weatherDay?.icon||'🌤️';
  $('weather-temp').textContent=typeof weatherDay?.temperature==='number'?`${Math.round(weatherDay.temperature)} °C`:'— °C';
  $('weather-desc').textContent=weatherDay?`${weatherDay.description}${typeof weatherDay.rainMm==='number'?` · ca. ${weatherDay.rainMm} mm nedbør`:''}`:state.weatherError||'Ingen tilgjengelig prognose for valgt dag.';
  const rainy=Boolean(features.rainReminder&&weatherDay&&
    ((typeof weatherDay.rainMm==='number'&&weatherDay.rainMm>=0.8)||/rain|sleet|snow/.test(weatherDay.symbol||'')));
  $('rain-reminder').hidden=!rainy;
  $('rain-reminder').textContent=rainy?'☔ Regntøy kan være lurt å pakke for denne dagen.':'';
}
async function fetchJSON(url){
  const controller=new AbortController();const t=setTimeout(()=>controller.abort(),13000);
  try{
    const response=await fetch(url,{signal:controller.signal});
    const data=await response.json();if(!response.ok)throw new Error(data.warning||data.error||`Feil ${response.status}`);
    return data;
  }finally{clearTimeout(t);}
}
async function reload(){
  if(!state.grade)return;
  const id=++state.requestId;
  state.plan=null;state.planError=null;state.weather=null;state.weatherError=null;state.loading=true;
  renderContent();
  const grade=state.grade;
  const requests=[fetchJSON(`/api/plan?grade=${encodeURIComponent(grade)}`)];
  if(features.weather)requests.push(fetchJSON('/api/weather'));
  const [plan,weather]=await Promise.allSettled(requests);
  if(id!==state.requestId||state.grade!==grade)return;
  if(plan.status==='fulfilled')state.plan=plan.value;
  else state.planError='Kunne ikke hente ukeplan. Åpne trinnsiden, eller prøv igjen.';
  if(weather){if(weather.status==='fulfilled')state.weather=weather.value;else state.weatherError='Været er midlertidig utilgjengelig.';}
  else state.weatherError='Værvisning er slått av.';
  state.loading=false;
  renderContent();
}
function selectGrade(grade){
  if(!validGrade(grade,school.grades))return;
  storageWrite(gradeSelectionKey(school.id),grade);
  state.grade=grade;state.day=calendar.weekday;renderShell();reload();
}
function clearGrade(){
  state.requestId++;state.grade=null;state.plan=null;state.weather=null;state.planError=null;
  storageDrop(gradeSelectionKey(school.id));renderShell();
}
function boot(){
  document.title=`${brand.title} · ${school.name}`;
  document.documentElement.style.setProperty('--brand',brand.color);
  document.documentElement.style.setProperty('--accent',brand.accent);
  $('brand-title').textContent=brand.title;
  if (brand.title.toLocaleLowerCase('nb-NO') === 'ukeplanen') $('brand-title').innerHTML='uke<span class="logo-accent">planen.</span>';
  $('brand-subtitle').textContent=brand.subtitle.toLocaleUpperCase('nb-NO');
  $('gate-school').textContent=school.name;
  $('footer-school').textContent=school.name;
  $('today').textContent=new Date().toLocaleDateString('nb-NO',{timeZone:school.timezone,weekday:'long',day:'numeric',month:'long'});
  $('week-label').textContent=`UKE ${calendar.week}`;
  renderGradeChoices();
  document.addEventListener('click',e=>{
    const grade=e.target.closest('[data-grade]');if(grade){selectGrade(grade.dataset.grade);return;}
    const day=e.target.closest('[data-day]');if(day){state.day=Number(day.dataset.day);renderShell();return;}
    if(e.target.closest('#undo-mission'))setChecked('mission',0,'all',false);
  });
  document.addEventListener('change',e=>{
    const el=e.target.closest('input[data-check]');if(el)setChecked(el.dataset.check,el.dataset.index,el.dataset.progressDay,el.checked);
  });
  $('change-grade').addEventListener('click',clearGrade);
  $('reload').addEventListener('click',reload);
  const initial=storageRead(gradeSelectionKey(school.id));
  if(validGrade(initial,school.grades))selectGrade(initial);
  else renderShell();
  // If a tablet or fridge display stays open, refresh on week/date rollover.
  setInterval(()=>{
    const next=schoolCalendar(new Date(),school.timezone);
    if(next.today!==calendar.today||next.week!==calendar.week||next.year!==calendar.year){
      calendar=next;state.day=next.weekday;
      $('week-label').textContent=`UKE ${next.week}`;
      $('today').textContent=new Date().toLocaleDateString('nb-NO',{timeZone:school.timezone,weekday:'long',day:'numeric',month:'long'});
      if(state.grade){renderShell();reload();}
    }else if(state.grade)reload();
  },60*60*1000);
}
boot();
