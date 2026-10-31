/** A separate, child-only UI. No parent account, Supabase key or sibling data. */
import {siteConfig} from '../site-config.mjs';
import {DAYS,dayDate,familyWeekCalendar} from '../shared/calendar.mjs';
import {groupColorClass} from '../shared/group-scope.mjs';
import {needsHomeworkHelp} from '../shared/homework-help-eligibility.mjs';
import {scopedHomeworkItems,scopedPackingItems,childSchoolDayDetails,
 childCheckedKey,readChildChecks,setChildCheck,homeworkItemKey} from './child-learning.mjs';
import {renderChildQuiz,initChildQuiz} from './child-quiz.mjs';
import {childTaskKey,checkedProgress,importCandidates} from './child-progress.mjs';
import {packingFingerprint} from '../shared/packing-fingerprint.mjs';
import {initChildHelper,openChildHelper} from './child-helper.mjs';
import {activityOccurrences,activityTimeLabel} from '../shared/family-activities.mjs';

const $=id=>document.getElementById(id);
const KEY='skoleuka.child.device.v1';
const esc=s=>String(s??'').replace(/[&<>"']/gu,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const safeURL=raw=>{try{const u=new URL(raw);return u.protocol==='https:'?u.href:null;}catch{return null;}};
const state={child:null,plan:null,activities:[],day:0,calendar:null,session:null,installer:null,
 homework:[],bag:[],progress:null,progressBusy:false,progressError:'',
 packing:null,packingBusy:false,packingError:''};
const getToken=()=>{try{return localStorage.getItem(KEY);}catch{return null;}};
function setToken(token){
 try{if(token)localStorage.setItem(KEY,token);else localStorage.removeItem(KEY);}catch{}
}
function status(message){$('child-status').textContent=message||'';}
const empty=message=>'<p class="child-empty">'+esc(message)+'</p>';
const groupBadge=group=>group?'<span class="child-group '+groupColorClass(group)+'">'+esc(group)+'</span>':'';
const packStore=()=>childCheckedKey(state.child,state.calendar.year,state.calendar.week,'bag',DAYS[state.day]);
const homeworkStore=()=>childCheckedKey(state.child,state.calendar.year,state.calendar.week,'homework');
const checks=key=>{try{return readChildChecks(localStorage,key);}catch{return {};}};
const timeline=events=>events.map(block=>
 '<div class="child-timeblock">'+(block.time?'<time class="child-time">'+esc(block.time)+'</time>':'<span class="child-time">📌</span>')+
 '<div class="child-timeentries">'+block.entries.map(item=>
   '<div class="child-timeentry">'+groupBadge(item.group)+
   '<strong>'+esc(item.title||'Skoleaktivitet')+'</strong>'+
   (item.endTime?'<small>'+esc(item.endTime)+'</small>':'')+
   (item.description?'<small>'+esc(item.description)+'</small>':'')+
   '</div>').join('')+'</div></div>').join('');
async function get(path,{method='GET',body,token=null}={}){
 const headers={Accept:'application/json'};
 if(token)headers.Authorization='Bearer '+token;
 if(body!==undefined)headers['Content-Type']='application/json';
 const r=await fetch(path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',
  referrerPolicy:'no-referrer'});
 const data=await r.json().catch(()=>null);
 if(!r.ok)throw Object.assign(Error(data?.error||'Kunne ikke hente ukeplanen.'),{status:r.status});
 return data;
}
function setup(message){
 state.child=null;state.plan=null;state.activities=[];state.progress=null;
 state.progressBusy=false;state.progressError='';state.packing=null;state.packingBusy=false;state.packingError='';
 $('child-ready').hidden=true;$('child-setup').hidden=false;
 $('child-setup-message').textContent=message||
  'Be en foresatt åpne «Inviter barn» under din profil og skann QR-koden med denne enheten.';
 status('');
}
const schoolDay=day=>dayDate(state.calendar.year,state.calendar.week,day);
const isPresent=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function render(){
 const {child,plan,calendar}=state;if(!child||!calendar)return;
 $('child-setup').hidden=true;$('child-ready').hidden=false;
 $('child-grade').textContent=(siteConfig.schools[child.school]?.name||'Skolen')+
  ' · '+child.grade+'. trinn';
 $('child-greeting').textContent='Hei, '+child.name+'! 👋';
 $('child-week-info').textContent='Uke '+calendar.week+' · '+calendar.year+
  (calendar.upcoming?' · neste skoleuke':'');
 $('child-badge').textContent='Uke '+calendar.week;
 const ok=plan&&plan.year===calendar.year&&plan.week===calendar.week&&
  !['error','unpublished','unreadable','unavailable'].includes(plan.status)&&
  plan.aiStatus!=='processing';
 $('child-days').innerHTML=DAYS.map((day,i)=>
  '<button type="button" data-child-day="'+i+'" '+(i===state.day?'aria-current="date"':'')+
  ' class="'+(i===state.day?'selected':'')+'"><strong>'+esc(day.slice(0,3))+
  '</strong><span>'+new Date(schoolDay(i)+'T12:00:00Z').getUTCDate()+'</span></button>').join('');
 const day=DAYS[state.day];
 const details=childSchoolDayDetails(ok?plan:null,child,day);
 $('child-events').innerHTML=ok?(details.own.length?timeline(details.own):
  empty('Ingen spesielle hendelser for din gruppe denne dagen.')):
  empty('Ukeplanen er ikke publisert eller ferdig tolket. Prøv «Oppdater».');
 $('child-notes').innerHTML=details.notes.map(note=>
  '<p class="child-note">'+(note.important?'⚠️ ':'📌 ')+
   groupBadge(note.group)+esc(note.text)+'</p>').join('');
 $('child-attendance').innerHTML=details.attendance.length?
  '<div class="child-attendance"><strong>⏰ Særskilt oppmøte</strong>'+
  details.attendance.map(item=>'<p>'+groupBadge(item.group)+'Kl. '+esc(item.time)+' · '+
   esc(item.text||'')+'</p>').join('')+'</div>':'';
 $('child-other-groups').hidden=!details.other.length;
 $('child-other-events').innerHTML=details.other.length?timeline(details.other):'';
 const activityRows=activityOccurrences(state.activities,calendar.year,calendar.week)
  .filter(x=>x.date===schoolDay(state.day)&&(!x.child_id||x.child_id===child.id));
 $('child-activities').innerHTML=activityRows.length?activityRows.map(x=>
  '<article class="child-row"><span class="child-row-time">'+esc(activityTimeLabel(x))+
  '</span><span><strong>'+esc(x.title)+'</strong>'+
  (x.location?'<small>'+esc(x.location)+'</small>':'')+
  (x.notes?'<small>'+esc(x.notes)+'</small>':'')+
  '</span></article>').join(''):empty('Ingen familieaktiviteter denne dagen.');
 state.bag=ok?scopedPackingItems(plan,child,day):[];
 const bagDone=checks(packStore());
 const bagIsDone=item=>state.packing instanceof Map?
  state.packing.get(packingFingerprint({school:child.school,grade:child.grade,
   year:calendar.year,week:calendar.week,day,item}))===true:bagDone[item.key]===true;
 const bagCount=state.bag.filter(bagIsDone).length;
 $('child-bag').innerHTML=state.bag.length?'<div class="child-check-list">'+
  state.bag.map(item=>'<label class="child-check-row '+(bagIsDone(item)?'is-done':'')+'">'+
   '<input type="checkbox" data-child-bag="'+esc(item.key)+'" '+(bagIsDone(item)?'checked':'')+
   (state.packing instanceof Map&&!state.packingBusy?'':' disabled')+
   '><span class="child-check-content">'+groupBadge(item.group)+
   '<strong>'+esc(item.label)+'</strong>'+(item.note?'<small>'+esc(item.note)+'</small>':'')+
   '</span></label>').join('')+'</div>':empty('Ingen ekstra utstyr denne dagen.');
 $('child-bag-progress').textContent=state.bag.length?bagCount+' av '+state.bag.length+' pakket':'';
 state.homework=ok?scopedHomeworkItems(plan,child):[];
 const oldChecks=checks(homeworkStore());
 const shared=state.progress instanceof Map;
 const isDone=task=>shared?state.progress.get(childTaskKey(child,calendar,task))===true:
  oldChecks[homeworkItemKey(task)]===true;
 const homeworkDone=state.homework.filter(isDone).length;
 const imports=importCandidates(state.homework,child,calendar,state.progress,oldChecks);
 $('child-import-homework').hidden=!shared||!imports.length||state.progressBusy;
 $('child-import-homework').textContent='Overfør '+imports.length+
  ' tidligere '+(imports.length===1?'avkrysning':'avkrysninger')+' fra denne enheten';
 $('child-homework-sync').textContent=state.progressBusy?'☁️ Lagrer lekseprogresjon …':
  state.progressError?'⚠️ '+state.progressError:
  shared?'☁️ Lekseprogresjon deles med foresatte og andre enheter.':
   '⚠️ Kun tidligere lokale avkrysninger vises. Felles lekseprogresjon kan ikke hentes akkurat nå.';

 $('child-homework-progress').textContent=state.homework.length?
  '⭐ '+homeworkDone+' av '+state.homework.length+' lekser fullført':'';
 $('child-homework').innerHTML=state.homework.length?'<div class="child-check-list">'+
  state.homework.map(item=>{
   const checked=isDone(item);
   const label=item.dueLabel||(item.repeatLabel?'':'Frist ikke oppgitt i ukeplanen');
   return '<article class="child-homework-item"><label class="child-check-row '+(checked?'is-done':'')+'">'+
    '<input type="checkbox" data-child-homework="'+item.index+'" '+(checked?'checked':'')+
    (shared&&!state.progressBusy?'':' disabled')+'>'+
    '<span class="child-check-content">'+groupBadge(item.group)+
    (label?'<span class="child-homework-due">📅 '+esc(label)+'</span>':'')+
    (item.repeatLabel?'<small>'+esc(item.repeatLabel)+'</small>':'')+
    (item.subject?'<small class="child-homework-subject">'+esc(item.subject)+'</small>':'')+
    '<strong>'+esc(item.text||'')+'</strong></span></label>'+
    (needsHomeworkHelp(item)?'<button class="child-outline child-help-button" data-child-help-task="'+item.index+
     '" type="button">✨ Få leksehjelp</button>':'')+'</article>';
  }).join('')+'</div>':empty('Ingen lekser registrert for denne uka.');
 renderChildQuiz(ok?plan?.vocabulary:[],{child,school:child.school,grade:child.grade,
  year:calendar.year,week:calendar.week});
 const link=safeURL(plan?.pdf)||safeURL(plan?.source);
 $('child-source').innerHTML=link?
  'Ukeplanen kommer fra skolen. <a href="'+esc(link)+
   '" target="_blank" rel="noopener noreferrer">Se originalen ↗</a>':
  'Skolen har ennå ikke publisert en tilgjengelig PDF. For detaljer: spør en foresatt.';
 status(state.packingError?'⚠️ '+state.packingError:ok?'':plan?.aiStatus==='processing'?'Skolens PDF behandles. Prøv igjen senere.':
  'Noen skoleopplysninger mangler for denne uka.');
}
async function load(){
 if(state.progressBusy)return; // Keep in-flight writes from being overwritten by a refresh.
 state.session=getToken();
 state.progress=null;state.progressError='';state.packing=null;state.packingError='';
 if(!state.session||!/^[a-f0-9]{64}$/u.test(state.session)){setup();return;}
 status('Henter ukeplanen din …');
 const cal=familyWeekCalendar(new Date(),'Europe/Oslo');
 state.calendar=cal;
 try{
  const childData=await get('/api/child-access?action=child&year='+cal.year+'&week='+cal.week,
   {token:state.session});
  const child=childData.child;
  if(!child?.id||!siteConfig.schools[child.school]||
    !/^[1-7](?:[A-F])?$/iu.test(child.grade))throw Error('Barnets profil kan ikke vises.');
  state.child=child;state.activities=childData.activities||[];
  const url='/api/plan?school='+encodeURIComponent(child.school)+'&grade='+
   encodeURIComponent(child.grade)+(cal.upcoming?'&nextWeek=1':'');
  try{state.plan=await get(url);}catch{state.plan=null;}
  try{
   const result=await get('/api/child-access?action=progress&year='+cal.year+'&week='+cal.week,
    {token:state.session});
   state.progress=checkedProgress(result.progress);
  }catch(error){
   if(error.status===401||error.status===403)throw error;
   state.progress=null;
   state.progressError='Synkronisering er utilgjengelig. Prøv «Oppdater ukeplan» igjen.';
  }
  try{
   const pack=await get('/api/child-access?action=packing&year='+cal.year+'&week='+cal.week,
    {token:state.session});
   state.packing=checkedProgress(pack.progress);
  }catch(error){
   if(error.status===401)throw error;
   state.packing=null;
   state.packingError='Pakkelisten kan ikke synkroniseres akkurat nå.';
  }
  state.day=cal.weekday;
  render();
  showInstall();
 }catch(e){
  if(e.status===401||e.status===403){setToken(null);state.session=null;}
  setup(e.message||'Kan ikke hente ukeplanen akkurat nå.');
 }
}
async function activate(token){
 history.replaceState(null,'','/barn/');
 if(!/^[a-f0-9]{64}$/u.test(token)){setup('QR-koden er ugyldig.');return;}
 status('Aktiverer din ukeplan …');
 try{
  const response=await get('/api/child-access',{method:'POST',body:{action:'redeem',token}});
  if(!/^[a-f0-9]{64}$/u.test(response.session))throw Error('Enheten ble ikke aktivert.');
  setToken(response.session);await load();
 }catch(e){setup(e.message||'Be en foresatt lage en ny QR-kode.');}
}
function showInstall(){
 const installed=isPresent(),box=$('child-install-box');
 box.hidden=installed||sessionStorage.getItem('child-install-dismissed')==='1';
 const ios=/iphone|ipad|ipod/iu.test(navigator.userAgent);
 $('child-install-help').textContent=ios?
  'Trykk Del i nettleseren, og velg «Legg til på Hjem-skjerm». Åpne deretter appikonet.':
  'Trykk «Legg til på hjemskjermen», eller velg Installer i nettlesermenyen.';
 $('child-install-button').hidden=ios;
}
window.addEventListener('beforeinstallprompt',event=>{
 event.preventDefault();state.installer=event;showInstall();
});
window.addEventListener('appinstalled',()=>{$('child-install-box').hidden=true;});
$('child-install-button').addEventListener('click',async()=>{
 if(!state.installer){
  $('child-install-help').textContent='Åpne nettlesermenyen (⋮) og velg «Installer app» eller «Legg til på hjemskjermen».';
  return;
 }
 await state.installer.prompt();state.installer=null;
});
$('child-install-dismiss').addEventListener('click',()=>{
 sessionStorage.setItem('child-install-dismissed','1');$('child-install-box').hidden=true;
});
$('child-bag').addEventListener('change',async event=>{
 const el=event.target.closest('[data-child-bag]');
 if(!el||!state.child||!state.calendar||state.packingBusy)return;
 const item=state.bag.find(x=>x.key===el.dataset.childBag);
 if(!item||!(state.packing instanceof Map)){render();return;}
 const {child,calendar,session}=state,day=DAYS[state.day];
 const key=packingFingerprint({school:child.school,grade:child.grade,
  year:calendar.year,week:calendar.week,day,item});
 const previous=state.packing.get(key),completed=el.checked;
 state.packingBusy=true;state.packing.set(key,completed);render();
 try{
  await get('/api/child-access',{method:'POST',token:session,body:{action:'set-packing',
   year:calendar.year,week:calendar.week,taskKey:key,completed}});
 }catch(error){
  if(error.status===401){setToken(null);setup('Enhetens tilgang er utløpt.');return;}
  if(previous===undefined)state.packing.delete(key);else state.packing.set(key,previous);
  state.packingError='Pakkestatus ble ikke delt med foreldrene. Prøv igjen.';
 }finally{state.packingBusy=false;if(state.child)render();}
});
$('child-homework').addEventListener('change',async event=>{
 const el=event.target.closest('[data-child-homework]');
 if(!el||!state.child||!state.calendar||state.progressBusy)return;
 const item=state.homework.find(x=>x.index===Number(el.dataset.childHomework));
 if(!item||!(state.progress instanceof Map)){render();return;}
 const key=childTaskKey(state.child,state.calendar,item),previous=state.progress.get(key);
 const checked=el.checked,year=state.calendar.year,week=state.calendar.week,token=state.session;
 state.progressBusy=true;state.progressError='';state.progress.set(key,checked);render();
 try{
  await get('/api/child-access',{method:'POST',token,
   body:{action:'set-progress',year,week,taskKey:key,completed:checked}});
 }catch(error){
  if(error.status===401||error.status===403){
   setToken(null);setup('Enhetens tilgang er avsluttet. Be en foresatt lage en ny QR-kode.');return;
  }
  if(previous===undefined)state.progress.delete(key);else state.progress.set(key,previous);
  state.progressError='Endringen ble ikke lagret i familiekontoen. Prøv igjen.';
 }finally{state.progressBusy=false;if(state.child)render();}
});
$('child-import-homework').addEventListener('click',async()=>{
 if(!(state.progress instanceof Map)||state.progressBusy||!state.child)return;
 const items=importCandidates(state.homework,state.child,state.calendar,
  state.progress,checks(homeworkStore()));
 if(!items.length)return;
 const year=state.calendar.year,week=state.calendar.week,token=state.session;
 state.progressBusy=true;state.progressError='';render();
 try{
  for(const item of items){
   const taskKey=childTaskKey(state.child,state.calendar,item);
   await get('/api/child-access',{method:'POST',token,
    body:{action:'set-progress',year,week,taskKey,completed:true}});
   state.progress.set(taskKey,true);
  }
 }catch(error){
  if(error.status===401||error.status===403){
   setToken(null);setup('Enhetens tilgang er avsluttet. Be en foresatt lage en ny QR-kode.');return;
  }
  state.progressError='Noen eldre avkrysninger kunne ikke overføres. Prøv igjen.';
 }finally{state.progressBusy=false;if(state.child)render();}
});
$('child-homework').addEventListener('click',event=>{
 const btn=event.target.closest('[data-child-help-task]');
 if(!btn||!state.child)return;
 const item=state.homework.find(x=>x.index===Number(btn.dataset.childHelpTask));
 if(item)openChildHelper(item,state.child.grade);
});
initChildQuiz();
initChildHelper();
$('child-days').addEventListener('click',e=>{
 const button=e.target.closest('[data-child-day]');if(!button)return;
 const value=Number(button.dataset.childDay);if(value<0||value>4)return;
 state.day=value;render();
});
$('child-refresh').addEventListener('click',()=>void load());
$('child-retry').addEventListener('click',()=>void load());
$('child-remove').addEventListener('click',async()=>{
 if(!confirm('Fjerne denne enhetens tilgang? Du trenger en ny QR-kode for å bruke appen igjen.'))return;
 const token=getToken();
 $('child-remove').disabled=true;
 try{
  if(token)await get('/api/child-access',{method:'POST',
   body:{action:'self-revoke'},token});
 }catch{
  // The server may be offline or the session may already be invalid.
  // Keep the device offline/inactive locally; guardian can revoke it online.
 }finally{
  setToken(null);state.session=null;setup();
  $('child-remove').disabled=false;
 }
});
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible'&&getToken())void load();
});
// Re-check guardian revocations while the app stays open.
setInterval(()=>{if(document.visibilityState==='visible'&&getToken())void load();},15*60_000);
if('serviceWorker' in navigator)navigator.serviceWorker.register('/barn/sw.js',{scope:'/barn/'}).catch(()=>{});
const pair=new URL(location.href).searchParams.get('pair');
if(pair)void activate(pair);
else void load();
