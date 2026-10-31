/** A separate, child-only UI. No parent account, Supabase key or sibling data. */
import {siteConfig} from '../site-config.mjs';
import {DAYS,dayDate,familyWeekCalendar} from '../shared/calendar.mjs';
import {groupApplies} from '../shared/family-core.mjs';
import {expandHomework} from '../shared/homework-view.mjs';
import {activityOccurrences,activityTimeLabel} from '../shared/family-activities.mjs';

const $=id=>document.getElementById(id);
const KEY='skoleuka.child.device.v1';
const esc=s=>String(s??'').replace(/[&<>"']/gu,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const safeURL=raw=>{try{const u=new URL(raw);return u.protocol==='https:'?u.href:null;}catch{return null;}};
const state={child:null,plan:null,activities:[],day:0,calendar:null,session:null,installer:null};
const getToken=()=>{try{return localStorage.getItem(KEY);}catch{return null;}};
function setToken(token){
 try{if(token)localStorage.setItem(KEY,token);else localStorage.removeItem(KEY);}catch{}
}
function status(message){$('child-status').textContent=message||'';}
const empty=message=>'<p class="child-empty">'+esc(message)+'</p>';
const scoped=(items,child)=>Array.isArray(items)?items.filter(x=>groupApplies(x,child)):[];
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
 const day=DAYS[state.day],school=plan?.days?.[day]||{};
 const events=ok?scoped(school.events,child):[];
 $('child-events').innerHTML=ok?(events.length?
  events.map(x=>'<article class="child-row"><span class="child-row-time">'+
   esc(x.time||'📌')+'</span><span>'+esc(x.title||x.text||'Skoleaktivitet')+'</span></article>').join(''):
  empty('Ingen spesielle hendelser registrert for denne dagen.')):
  empty('Ukeplanen er ikke publisert eller tolket ennå. Prøv «Oppdater».');
 const notes=ok?scoped(plan?.dayNotes?.[day],child):[];
 $('child-notes').innerHTML=notes.map(x=>
  '<p class="child-note">📌 '+esc(x.text||x.label||x)+'</p>').join('');
 const activityRows=activityOccurrences(state.activities,calendar.year,calendar.week)
  .filter(x=>x.date===schoolDay(state.day)&&(!x.child_id||x.child_id===child.id));
 $('child-activities').innerHTML=activityRows.length?activityRows.map(x=>
  '<article class="child-row"><span class="child-row-time">'+esc(activityTimeLabel(x))+
  '</span><span><strong>'+esc(x.title)+'</strong>'+
  (x.location?'<small>'+esc(x.location)+'</small>':'')+
  (x.notes?'<small>'+esc(x.notes)+'</small>':'')+
  '</span></article>').join(''):empty('Ingen familieaktiviteter denne dagen.');
 const bag=ok?[...scoped(plan?.everyday,child),...scoped(school.bring,child)]:[];
 const labels=[...new Set(bag.map(x=>String(x?.label||x?.text||'').trim()).filter(Boolean))];
 $('child-bag').innerHTML=labels.length?'<ul class="child-list">'+
  labels.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':empty('Ingen ekstra utstyr denne dagen.');
 const tasks=ok?scoped(expandHomework(plan?.homework||[]),child):[];
 $('child-homework').innerHTML=tasks.length?
  '<ul class="child-list">'+tasks.map(x=>'<li>'+
   (x.subject?'<b>'+esc(x.subject)+'</b> · ':'')+esc(x.text)+
   (x.dueDay?'<small>Frist: '+esc(x.dueDay)+'</small>':'')+'</li>').join('')+'</ul>':
  empty('Ingen lekser registrert for denne uka.');
 const link=safeURL(plan?.pdf)||safeURL(plan?.source);
 $('child-source').innerHTML=link?
  'Ukeplanen kommer fra skolen. <a href="'+esc(link)+
   '" target="_blank" rel="noopener noreferrer">Se originalen ↗</a>':
  'Skolen har ennå ikke publisert en tilgjengelig PDF. For detaljer: spør en foresatt.';
 status(ok?'':plan?.aiStatus==='processing'?'Skolens PDF behandles. Prøv igjen senere.':
  'Noen skoleopplysninger mangler for denne uka.');
}
async function load(){
 state.session=getToken();
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
$('child-days').addEventListener('click',e=>{
 const button=e.target.closest('[data-child-day]');if(!button)return;
 const value=Number(button.dataset.childDay);if(value<0||value>4)return;
 state.day=value;render();
});
$('child-refresh').addEventListener('click',()=>void load());
$('child-retry').addEventListener('click',()=>void load());
$('child-remove').addEventListener('click',()=>{
 if(!confirm('Fjerne ukeplanen fra denne enheten? En foresatt kan også oppheve tilgangen.'))return;
 setToken(null);state.child=null;setup();
});
if('serviceWorker' in navigator)navigator.serviceWorker.register('/barn/sw.js',{scope:'/barn/'}).catch(()=>{});
const pair=new URL(location.href).searchParams.get('pair');
if(pair)void activate(pair);
else void load();
