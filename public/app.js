import {SITE, GRADES, choiceStorageKey} from './site-config.mjs';
import {norwayCalendar, isExpiredSchoolDay, REFRESH_INTERVAL_MS} from './calendar.mjs';
import {fetchJsonWithTimeout} from './network.mjs';
import {themePresentation, themeProgressKey} from './theme.mjs';
import {homeworkStorageKey, homeworkItemKey} from './homework.mjs';
import {rainwearExpected} from './rain.mjs';

const DAYS=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=norwayCalendar();
const weekMonday=(()=>{const fourth=new Date(Date.UTC(today.year,0,4));const monday=new Date(fourth);monday.setUTCDate(fourth.getUTCDate()-(fourth.getUTCDay()+6)%7+(today.week-1)*7);return monday;})();
const dayDate=index=>{const d=new Date(weekMonday);d.setUTCDate(d.getUTCDate()+index);return d;};
const dayKey=index=>dayDate(index).toISOString().slice(0,10);
const dayLabel=index=>dayDate(index).toLocaleDateString('nb-NO',{timeZone:'UTC',day:'numeric',month:'short'});
const currentLocal={
  get(k){try{return localStorage.getItem(k)}catch{return null}},
  set(k,v){try{localStorage.setItem(k,v)}catch{}},
  remove(k){try{localStorage.removeItem(k)}catch{}}
};
const initialGrade=currentLocal.get(choiceStorageKey());
const state={
  grade:GRADES.includes(initialGrade)?initialGrade:null,
  day:today.day,plan:null,planStatus:'loading',planError:null,
  weather:null,weatherStatus:'loading',weatherError:null,
  fetching:false,subject:null,expandedMission:false,loadVersion:0,lastRefresh:0
};

const planCacheKey=g=>`ukeplan.${SITE.id}.week.${today.year}.${today.week}.${g}.v1`;
const weatherCacheKey=()=>`ukeplan.${SITE.id}.weather.${today.dateKey}.v1`;
const bagKey=(g,day)=>`ukeplan.${SITE.id}.bag.${today.year}.${today.week}.${g}.${day}.v1`;
const hwKey=g=>`ukeplan.${SITE.id}.${homeworkStorageKey(today.year,today.week,g)}`;
const missionKey=(g,name)=>`ukeplan.${SITE.id}.${themeProgressKey(today.year,today.week,g,name)}`;
const readRecord=key=>{try{return JSON.parse(currentLocal.get(key)||'{}')||{}}catch{return {}}};
const saveRecord=(key,value)=>currentLocal.set(key,JSON.stringify(value));
const isCurrent=(plan,g)=>plan&&String(plan.grade)===g&&plan.year===today.year&&plan.week===today.week&&plan.status!=='error'&&plan.status!=='unpublished';

function configureBrand(){
  document.documentElement.style.setProperty('--primary',SITE.colors.primary);
  document.documentElement.style.setProperty('--accent',SITE.colors.accent);
  document.title=`${SITE.appName} · ${SITE.schoolName}`;
  $('app-name').textContent=SITE.appName;
  $('brand-symbol').textContent=SITE.logo;
  $('school-name').textContent=SITE.schoolName;
  $('footer-school').textContent=SITE.schoolName;
  $('today-label').textContent=new Date().toLocaleDateString('nb-NO',{day:'numeric',month:'long',timeZone:'Europe/Oslo'});
}
function buildGradePicker(){
  $('grade-grid').innerHTML=GRADES.map(g=>
    `<button type="button" class="grade-option" data-grade="${g}" aria-label="Velg ${g}. klasse">`+
    `<span class="number">${g}.</span><span class="ordinal">klasse</span></button>`).join('');
  $('grade-grid').querySelectorAll('button[data-grade]').forEach(button=>button.addEventListener('click',()=>selectGrade(button.dataset.grade)));
}
function selectGrade(grade){
  if(!GRADES.includes(grade))return;
  state.loadVersion++;
  state.grade=grade;state.day=today.day;state.subject=null;state.expandedMission=false;
  state.plan=null;state.planStatus='loading';state.planError=null;state.weather=null;state.weatherStatus='loading';state.weatherError=null;
  currentLocal.set(choiceStorageKey(),grade);
  restoreCache();render();refreshAll();
}
function resetGrade(){
  state.loadVersion++;
  state.grade=null;state.plan=null;state.weather=null;state.planError=null;state.weatherError=null;
  state.planStatus='loading';state.weatherStatus='loading';state.fetching=false;
  currentLocal.remove(choiceStorageKey());render();
  $('grade-grid').querySelector('button')?.focus();
}
function restoreCache(){
  if(!state.grade)return;
  const p=readRecord(planCacheKey(state.grade));
  if(isCurrent(p,state.grade)){state.plan=p;state.planStatus='cached'}
  const w=readRecord(weatherCacheKey());
  if(w.days && typeof w.days==='object'){state.weather=w;state.weatherStatus='cached'}
}
function warning(message,type='warning'){
  $('warnings').innerHTML=message?`<div class="warning ${type==='error'?'danger':''}">${esc(message)}</div>`:'';
}
function render(){
  const grade=state.grade;
  $('onboarding').hidden=!!grade;
  $('dashboard').hidden=!grade;
  $('reset-grade').hidden=!grade;
  if(!grade)return;
  $('hero-title').textContent=`${grade}. klasse er klar!`;
  $('hero-description').textContent=`${SITE.tagline} Her er ukens viktigste ting.`;
  $('grade-chip').textContent=`${grade}. KLASSE`;
  $('week-chip').textContent=`UKE ${today.week}`;
  $('grade-emoji').textContent=Number(grade)<=3?'🎨':Number(grade)<=5?'📚':'🎒';
  $('day-eyebrow').textContent=`${DAYS[state.day].toUpperCase()} · ${dayLabel(state.day).toUpperCase()}`;
  renderWeather();renderDays();renderEvents();renderBag();renderHomework();renderTheme();renderNotices();renderGoals();renderSource();
  if(state.planStatus==='error')warning('Ukeplanen kunne ikke hentes. Prøv å oppdatere eller åpne skolens trinnside.','error');
  else if(state.planStatus==='unpublished')warning(`Skolen har ikke publisert en ukeplan for uke ${today.week} på ${grade}. trinn ennå. Vi viser ikke en plan fra en annen uke.`);
  else if(state.planStatus==='partial'||state.planStatus==='unreadable')warning('PDF-en ble bare delvis tolket. Kontroller skolens original-PDF.');
  else if(state.planStatus==='cached')warning('Viser lagret ukeplan for denne uken. Oppdatering pågår.');
  else warning('');
}
function renderWeather(){
  const w=state.weather?.days?.[dayKey(state.day)];
  $('weather-icon').textContent=w?.icon||'🌤️';
  $('weather-temp').textContent=typeof w?.temperature==='number'?Math.round(w.temperature)+'°':'—°';
  $('weather-text').textContent=w?.description|| (state.weatherStatus==='loading'?'Henter værvarsel…':'Ingen prognose tilgjengelig');
  $('weather-details').textContent=typeof w?.rainMm==='number' ? `💧 ${String(w.rainMm).replace('.',',')} mm · kl. 08–15` : `Værdata fra Yr · kl. 08–15`;
  const rainy=rainwearExpected(w);
  $('rain-note').hidden=!rainy;
  $('rain-note').innerHTML=rainy?'<span class="rain-icon">🌧️</span><span><strong>Husk regntøy før du går ut!</strong><small>Det er meldt regn i skoletiden. Ta på regnjakke og regnbukse før du går hjemmefra.</small></span>':'';
}
function renderDays(){
  $('weekdays').innerHTML=DAYS.map((name,index)=>{
    const expired=isExpiredSchoolDay(index,today.dow);
    return `<button type="button" class="day-button ${state.day===index?'selected':''}" data-day="${index}" ${expired?'disabled':''} aria-pressed="${state.day===index}"><strong>${name.slice(0,3)}</strong><span>${expired?'Utgått':esc(dayLabel(index))}</span></button>`;
  }).join('');
  $('weekdays').querySelectorAll('button[data-day]:not(:disabled)').forEach(button=>button.addEventListener('click',()=>{state.day=Number(button.dataset.day);render()}));
}
const icons={book:'📚',waves:'🏊',trees:'🌿',activity:'🏃',music:'🎵',sparkles:'✨',scissors:'🎨',bus:'🚌',sun:'☀️',gift:'🎁'};
function renderEvents(){
  const day=state.plan?.days?.[DAYS[state.day]];
  $('end-time').hidden=!day?.end;
  $('end-time').textContent=day?.end?`Slutt ${day.end}`:'';
  const events=day?.events||[];
  $('day-events').innerHTML=events.length?events.map(e=>
    `<div class="event-row"><div class="event-icon">${icons[e.icon]||'📚'}</div><div><div class="event-time">${esc(e.time||'Skoledagen')}</div><div class="event-title">${esc(e.title||'Aktivitet')}</div>${e.detail?`<p class="event-desc">${esc(e.detail)}</p>`:''}</div></div>`
  ).join(''):`<p class="empty">${state.plan?'Ingen detaljer for valgt dag i PDF-en. Se originalen for full oversikt.':state.planStatus==='loading'?'Henter ukens program…':'Ingen skoleplan tilgjengelig for denne uken.'}</p>`;
}
function bagItems(){
  const plan=state.plan;
  if(!plan)return [];
  const day=plan.days?.[DAYS[state.day]];
  const found=[...(plan.everyday||[]),...(day?.bring||[])].filter(x=>x&&typeof x.label==='string');
  return [...new Map(found.map(x=>[x.label.toLocaleLowerCase('nb-NO').trim(),x])).values()];
}
function renderBag(){
  const items=bagItems(),key=bagKey(state.grade,DAYS[state.day]),saved=readRecord(key);
  const checked=items.filter(i=>saved[i.label]).length;
  $('bag-count').textContent=items.length?`${checked}/${items.length} pakket`:'';
  $('bag-progress').style.width=items.length?`${100*checked/items.length}%`:'0%';
  $('bag-items').innerHTML=items.length?items.map((item,index)=>
    `<label class="pack-row ${saved[item.label]?'is-done':''}"><input type="checkbox" data-pack-index="${index}" ${saved[item.label]?'checked':''}><span class="pack-label">${esc(item.label)}${item.note?`<small>${esc(item.note)}</small>`:''}</span></label>`
  ).join(''):`<p class="empty">${state.plan?'Ingen ekstra ting å pakke i dag.':'Pakkelisten vises når ukeplanen er hentet.'}</p>`;
  $('bag-items').querySelectorAll('input[data-pack-index]').forEach(input=>input.addEventListener('change',()=>{
    const item=items[Number(input.dataset.packIndex)];if(!item)return;
    const record=readRecord(key);record[item.label]=input.checked;saveRecord(key,record);renderBag();
  }));
}
function renderHomework(){
  const assignments=(state.plan?.homework||[]).filter(i=>i?.subject&&i?.detail),subjects=[...new Set(assignments.map(i=>i.subject))];
  if(!subjects.includes(state.subject))state.subject=subjects[0]||null;
  const key=hwKey(state.grade),done=readRecord(key),doneCount=assignments.filter(i=>done[homeworkItemKey(i)]).length;
  $('homework-count').textContent=assignments.length?`${doneCount}/${assignments.length} gjort`:'';
  $('homework-tabs').innerHTML=subjects.map(sub=>{
    const group=assignments.filter(i=>i.subject===sub),n=group.filter(i=>done[homeworkItemKey(i)]).length;
    return `<button type="button" class="subject-button ${state.subject===sub?'selected':''}" data-subject="${esc(sub)}" aria-pressed="${state.subject===sub}">${esc(sub)} · ${n}/${group.length}</button>`;
  }).join('');
  $('homework-tabs').querySelectorAll('button[data-subject]').forEach(b=>b.addEventListener('click',()=>{state.subject=b.dataset.subject;renderHomework()}));
  const current=assignments.filter(i=>i.subject===state.subject);
  $('homework-items').innerHTML=current.length?current.map((i,index)=>{
    const checked=!!done[homeworkItemKey(i)];
    return `<label class="homework-row ${checked?'is-done':''}"><input type="checkbox" data-hw-index="${index}" ${checked?'checked':''}><span class="hw-text">${esc(i.detail)}<small>${checked?'✓ Fullført':'Trykk når du er ferdig'}</small></span></label>`;
  }).join(''):`<p class="empty">${state.plan?'Ingen lekser registrert i ukeplanen.':'Lekser vises når ukeplanen er hentet.'}</p>`;
  $('homework-items').querySelectorAll('input[data-hw-index]').forEach(input=>input.addEventListener('change',()=>{
    const item=current[Number(input.dataset.hwIndex)];if(!item)return;
    const record=readRecord(key);record[homeworkItemKey(item)]=input.checked;saveRecord(key,record);renderHomework();
  }));
}
function renderTheme(){
  const target=$('theme-section'),theme=themePresentation(state.plan?.weekTheme);
  target.hidden=!theme;
  if(!theme){target.innerHTML='';return}
  const key=missionKey(state.grade,theme.theme),done=!!readRecord(key).done;
  if(done&&!state.expandedMission){
    target.className='theme-panel complete';
    target.innerHTML=`<div><div class="theme-title"><span class="theme-symbol">${esc(theme.emoji)}</span><div><h2>${esc(theme.title)}</h2>${theme.subtitle?`<p>${esc(theme.subtitle)}</p>`:''}</div></div></div>`+
      `<div class="compact-actions"><strong>✓ Oppdrag utført</strong><button class="mission-button" id="expand-mission" type="button">Vis igjen ↓</button></div>`;
    $('expand-mission').addEventListener('click',()=>{state.expandedMission=true;renderTheme()});return;
  }
  target.className='theme-panel';
  target.innerHTML=`<div class="theme-eyebrow">✨ UKAS TEMA · ${state.grade}. KLASSE</div>`+
    `<div class="theme-content"><div class="theme-title"><span class="theme-symbol">${esc(theme.emoji)}</span><div><h2>${esc(theme.title)}</h2>${theme.subtitle?`<p>${esc(theme.subtitle)}</p>`:''}</div></div>`+
    `<div class="mission-box"><div class="mission-label">🎯 DITT OPPDRAG DENNE UKA</div><p>${esc(theme.quest)}</p>`+
    (done?'<strong class="mission-done">🎉 Bra jobbet! Oppdraget er fullført.</strong><div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="mission-button" id="collapse-mission" type="button">Vis mindre ↑</button><button class="secondary-button" id="undo-mission" type="button">Angre</button></div>':
      '<button class="mission-button" type="button" id="do-mission">✓ Jeg har gjort det!</button>')+
    `<div class="mission-sub">Frivillig forslag fra appen – ikke en skolelekse.</div></div></div>`;
  if(done){$('collapse-mission').addEventListener('click',()=>{state.expandedMission=false;renderTheme()});$('undo-mission').addEventListener('click',()=>{saveRecord(key,{done:false});renderTheme()})}
  else $('do-mission').addEventListener('click',()=>{saveRecord(key,{done:true});state.expandedMission=false;renderTheme()});
}
function renderNotices(){
  const notes=state.plan?.notices||[];
  $('notice-count').textContent=notes.length||'';
  $('notices').innerHTML=notes.length?notes.map(n=>`<div class="notice-item"><strong>${esc(n.title||'Beskjed')}</strong><span>${esc(n.detail||'')}</span></div>`).join(''):'Ingen beskjeder er hentet. Sjekk original-PDF ved tvil.';
}
function renderGoals(){
  const goals=(state.plan?.learningGoals||[]).filter(g=>typeof g==='string'&&g.trim());
  $('learning-goals-details').hidden=!goals.length;
  if(!goals.length){$('learning-goals').innerHTML='';return}
  $('goal-count').textContent=goals.length;
  $('learning-goals').innerHTML=`<ul class="goal-list">${goals.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
}
function renderSource(){
  const fallback=SITE.grades[state.grade];
  let url=fallback;
  const pdf=state.plan?.pdf;
  if(typeof pdf==='string')try{const u=new URL(pdf);if(u.protocol==='https:'&&SITE.pdfHosts.includes(u.hostname))url=pdf}catch{}
  $('source-link').href=url;
  $('source-note').textContent=state.plan?.pdf?'Ukeplan fra skolens PDF · kontroller originalen ved tvil.':'Kilde: skolens offentlige trinnside.';
}
async function loadPlan(version,grade){
  try{
    const data=await fetchJsonWithTimeout(`/api/plan?grade=${encodeURIComponent(grade)}`,{timeoutMs:18000,cache:'no-store'});
    if(state.loadVersion!==version||state.grade!==grade)return;
    if(data.status==='unpublished') {state.plan=null;state.planStatus='unpublished'}
    else if(isCurrent(data,grade)){state.plan=data;state.planStatus=data.status||'ok';saveRecord(planCacheKey(grade),data)}
    else {state.plan=null;state.planStatus='error'}
  }catch(err){
    if(state.loadVersion!==version||state.grade!==grade)return;
    state.planStatus=state.plan?'cached':'error';state.planError=err.code;
  }finally{if(state.loadVersion===version&&state.grade===grade)render()}
}
async function loadWeather(version){
  try{const data=await fetchJsonWithTimeout('/api/weather',{timeoutMs:9000,cache:'default'});
    if(state.loadVersion!==version||!state.grade)return;
    state.weather=data;state.weatherStatus=data.stale?'stale':'ok';saveRecord(weatherCacheKey(),data);
  }catch(err){if(state.loadVersion!==version||!state.grade)return;state.weatherStatus=state.weather?'cached':'error';state.weatherError=err.code}
  finally{if(state.loadVersion===version&&state.grade)render()}
}
async function refreshAll(){
  if(!state.grade||state.fetching)return;
  const grade=state.grade,version=++state.loadVersion;state.fetching=true;
  state.planStatus=state.plan?'cached':'loading';state.weatherStatus=state.weather?'cached':'loading';render();
  try{await Promise.all([loadPlan(version,grade),loadWeather(version)])}
  finally{if(state.loadVersion===version){state.fetching=false;state.lastRefresh=Date.now();render()}}
}
configureBrand();buildGradePicker();
$('reset-grade').addEventListener('click',resetGrade);
if(state.grade){restoreCache();render();refreshAll()}else render();
// On return to the tab, refresh if an hour has passed. Changing the school week requires a page reload.
setInterval(()=>{if(state.grade&&state.lastRefresh&&Date.now()-state.lastRefresh>=REFRESH_INTERVAL_MS)refreshAll()},60000);
window.__weekplanReady=true;
