/** Public, school-scoped weather. Never reads account, child sessions or progress. */
import {siteConfig} from '../site-config.mjs';

const esc=s=>String(s??'').replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const osloToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Oslo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dayLabel=date=>{
 const day=new Date(date+'T12:00:00Z');
 return new Intl.DateTimeFormat('nb-NO',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(day);
};
const amount=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('nb-NO',{maximumFractionDigits:1}):'—';
const degrees=n=>typeof n==='number'&&Number.isFinite(n)?Math.round(n)+' °C':'— °C';
const schoolTitle=id=>siteConfig.schools[id]?.name||'Skolen';
export function schoolWeatherSummary(forecast,date){
 const day=forecast?.days?.[date];
 if(!day)return null;
 return {icon:day.icon||'🌤️',temperature:degrees(day.temperature),
  description:day.description||'Værmelding',
  rain:typeof day.rainMm==='number'?amount(day.rainMm)+' mm nedbør':null,
  date,day};
}
/** Returns an instance with updateSchools(ids) and refresh(). */
export function initSchoolWeather({host}){
 if(!host)return {updateSchools(){},refresh(){}};
 let schools=[],selected='',forecast=null,chosenDate='',loading=false,error='',sequence=0;
 host.classList.add('school-weather');
 host.innerHTML=`<div class="school-weather-card">
  <button type="button" class="school-weather-open sk-action sk-action--card" aria-haspopup="dialog" aria-label="Se detaljert værmelding">
   <span class="school-weather-icon" aria-hidden="true">🌤️</span>
   <span class="school-weather-copy"><strong>Været i skoleområdet</strong><small class="school-weather-subtitle">Henter værmelding …</small></span>
   <span class="school-weather-temperature">— °C</span><span class="school-weather-arrow" aria-hidden="true">›</span>
  </button>
 </div>
 <dialog class="school-weather-dialog" aria-modal="true" aria-labelledby="school-weather-title">
  <div class="school-weather-dialog-head"><div><p class="school-weather-eyebrow">VÆRET I SKOLEOMRÅDET</p><h2 id="school-weather-title">Time for time</h2><p class="school-weather-place"></p></div>
   <button type="button" class="school-weather-close sk-action sk-action--close" aria-label="Lukk værmeldingen">✕</button></div>
  <div class="school-weather-dialog-body"><label class="school-weather-school-field">Skole<select class="school-weather-school"></select></label>
   <div class="school-weather-days" role="group" aria-label="Velg dag"></div>
   <div class="school-weather-daily" role="status"></div>
   <div class="school-weather-hours"></div>
   <p class="school-weather-attribution">Kilde: Meteorologisk institutt / Yr · Vær for skoledagen kl. 08–15. Prognosen kan endre seg.</p>
  </div>
 </dialog>`;
 const q=selector=>host.querySelector(selector);
 const dialog=q('.school-weather-dialog'),button=q('.school-weather-open'),selector=q('.school-weather-school');
 const getDates=()=>Object.keys(forecast?.days||{}).filter(date=>{
  if(date<osloToday())return false;
  const day=new Date(date+'T12:00:00Z').getUTCDay();
  return day>=1&&day<=5;
 }).sort().slice(0,5);
 const fillDays=()=>{
  const days=getDates();
  if(!days.includes(chosenDate))chosenDate=days[0]||'';
  q('.school-weather-days').innerHTML=days.map(date=>
   '<button type="button" class="sk-action sk-action--choice" data-weather-date="'+esc(date)+'" aria-pressed="'+String(date===chosenDate)+'">'+esc(dayLabel(date))+'</button>'
  ).join('');
 };
 function paint(){
  const dates=getDates(),today=osloToday();
  const compactDate=dates.includes(today)?today:dates[0];
  const summary=schoolWeatherSummary(forecast,compactDate);
  q('.school-weather-icon').textContent=summary?.icon||'🌤️';
  q('.school-weather-temperature').textContent=summary?.temperature||'— °C';
  q('.school-weather-subtitle').textContent=loading?'Henter værmelding …':
   error|| (summary?dayLabel(compactDate)+' · '+summary.description+' · '+(forecast?.locationLabel||schoolTitle(selected)):'Værmelding ikke tilgjengelig');
  q('.school-weather-place').textContent=(forecast?.locationLabel||schoolTitle(selected))+
   (forecast?.stale?' · Sist lagrede varsel':'');
  fillDays();
  const selectedSummary=schoolWeatherSummary(forecast,chosenDate);
  q('.school-weather-daily').textContent=error||(
   selectedSummary?selectedSummary.icon+' '+selectedSummary.temperature+' · '+selectedSummary.description+
   (selectedSummary.rain?' · '+selectedSummary.rain:''):'Værmelding er ikke tilgjengelig for valgt dag.');
  const hours=selectedSummary?.day?.hours||[];
  q('.school-weather-hours').innerHTML=hours.length?hours.map(row=>
   '<div class="school-weather-hour"><time>'+String(row.hour).padStart(2,'0')+':00</time>'+
   '<span class="school-weather-hour-icon" aria-label="'+esc(row.description)+'">'+esc(row.icon)+'</span>'+
   '<strong>'+esc(degrees(row.temperature))+'</strong>'+
   '<span>☔ '+(row.rainPeriod===1&&typeof row.rainMm==='number'?esc(amount(row.rainMm))+' mm':'—')+'</span>'+
   '<span>💨 '+(typeof row.wind==='number'?esc(amount(row.wind))+' m/s':'—')+'</span></div>'
  ).join(''):'<p class="school-weather-empty">Ingen timevarsel tilgjengelig for denne dagen.</p>';
  q('.school-weather-attribution').textContent='Kilde: Meteorologisk institutt / Yr · Vær for skoledagen kl. 08–15.'+
   (forecast?.stale?' Viser sist lagrede prognose.':'')+
   ' «—» betyr at timesdata mangler.';
 }
 async function refresh(){
  if(!selected||!siteConfig.features.weather)return;
  const id=selected,req=++sequence;loading=true;error='';paint();
  try{
   const response=await fetch('/api/weather?school='+encodeURIComponent(id),{headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('Værmelding midlertidig utilgjengelig.');
   const data=await response.json();
   if(req!==sequence||selected!==id)return;
   if(!data?.days||!Object.keys(data.days).length)throw Error('Ingen værdata tilgjengelig.');
   forecast=data;error=data.stale?'Viser sist lagrede værmelding.':'';
  }catch(e){if(req!==sequence)return;forecast=null;error=e.message||'Været er midlertidig utilgjengelig.';}
  finally{if(req===sequence){loading=false;paint();}}
 }
 function updateSchools(ids){
  const next=[...new Set((ids||[]).filter(id=>siteConfig.schools[id]))].sort();
  host.hidden=!next.length||!siteConfig.features.weather;
  const prior=selected;
  schools=next;
  if(!schools.includes(selected))selected=schools[0]||'';
  selector.replaceChildren();
  for(const id of schools){const option=document.createElement('option');option.value=id;option.textContent=schoolTitle(id);selector.append(option);}
  selector.value=selected;
  q('.school-weather-school-field').hidden=schools.length<2;
  if(prior!==selected){forecast=null;chosenDate='';void refresh();}
 }
 button.addEventListener('click',()=>{if(host.hidden)return;paint();dialog.showModal();q('.school-weather-close').focus();});
 q('.school-weather-close').addEventListener('click',()=>dialog.close());
 selector.addEventListener('change',()=>{selected=selector.value;forecast=null;chosenDate='';void refresh();});
 q('.school-weather-days').addEventListener('click',e=>{const date=e.target.closest('[data-weather-date]')?.dataset.weatherDate;
  if(date){chosenDate=date;paint();}
 });
 dialog.addEventListener('close',()=>button.focus({preventScroll:true}));
 paint();
 return {updateSchools,refresh};
}
