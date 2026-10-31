/** Responsive guardian dashboard navigation; desktop keeps its full calendar. */
const KEY='skoleuka.family.mobile.v1';
const VIEWS=new Set(['overview','calendar','activities']);
const SHORT_DAYS=['Man','Tir','Ons','Tor','Fre'];
const root=()=>document.getElementById('family-view');
const nav=()=>document.getElementById('family-mobile-nav');
const dayNav=()=>document.getElementById('family-mobile-days');
const days=()=>[...document.querySelectorAll('#family-agenda-days > .family-agenda-day')];
const mobile=()=>window.matchMedia('(max-width:700px)').matches;
const stored=()=>{try{return JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{return null;}};
export function initFamilyMobileUI(){
 const previous=stored();
 let view=VIEWS.has(previous?.view)?previous.view:'overview';
 let day=previous?.day==='all'||previous?.day==='today'||/^[0-6]$/.test(String(previous?.day))?
  String(previous.day):'today';
 const save=()=>{try{sessionStorage.setItem(KEY,JSON.stringify({view,day}));}catch{}};
 const options=document.getElementById('family-mobile-calendar-options');
 const dayStatus=document.getElementById('family-mobile-day-status');
 function paintTabs(){
  root().dataset.familyMobileView=view;
  for(const button of nav().querySelectorAll('[data-family-mobile-tab]'))
   button.setAttribute('aria-pressed',String(button.dataset.familyMobileTab===view));
 }
 function refreshDays(){
  const list=days();
  if(!list.length)return;
  const current=list.findIndex(el=>el.classList.contains('today'));
  const chosen=day==='all'?-1:day==='today'?
   (current>=0?current:0):Math.min(Number(day),Math.max(0,list.length-1));
  const select=day==='all'?'all':String(chosen);
  // Five fixed weekday tiles fit even a 320px phone. Weekends are available
  // through the secondary "Vis helg" action, never as overflow tiles.
  dayNav().innerHTML=list.slice(0,5).map((el,index)=>{
   const heading=el.querySelector('h3')?.textContent||'';
   const date=heading.match(/\b(\d{1,2})\b/)?.[1]||'–';
   const count=el.querySelectorAll('.family-agenda-item').length;
   return '<button type="button" class="family-mobile-day-tile" data-family-mobile-day="'+index+
    '" aria-pressed="'+String(select===String(index))+
    '" aria-label="'+SHORT_DAYS[index]+' '+date+', '+count+' hendelser">'+
    '<span class="family-mobile-day-name">'+SHORT_DAYS[index]+'</span>'+
    '<strong class="family-mobile-day-date">'+date+'</strong>'+
    '<span class="family-mobile-day-indicator'+(count?' has-events':'')+
    '" aria-hidden="true"></span></button>';
  }).join('');
  list.forEach((el,index)=>el.classList.toggle('family-mobile-day-hidden',
   chosen!==-1&&index!==chosen));
  const full=select==='all';
  const count=full?list.reduce((total,el)=>total+el.querySelectorAll('.family-agenda-item').length,0):
   list[chosen]?.querySelectorAll('.family-agenda-item').length||0;
  const heading=full?'Hele uka':list[chosen]?.querySelector('h3')?.textContent||'Valgt dag';
  dayStatus.textContent=heading+' · '+count+' hendelse'+(count===1?'':'r');
  const weekButton=options.querySelector('[data-family-mobile-range]');
  weekButton.textContent=full?'Vis én dag':'Vis hele uka';
  weekButton.setAttribute('aria-pressed',String(full));
  const weekendButton=options.querySelector('[data-family-mobile-weekend]');
  const original=document.getElementById('family-agenda-weekend-toggle');
  weekendButton.hidden=original.hidden;
  weekendButton.textContent=original.getAttribute('aria-expanded')==='true'?'Skjul helg':'Vis helg';
  if(!mobile())list.forEach(el=>el.classList.remove('family-mobile-day-hidden'));
 }
 function selectView(next,{scroll=false}={}){
  if(!VIEWS.has(next))return;
  view=next;save();paintTabs();
  if(scroll&&mobile())root().scrollIntoView({block:'start',behavior:'auto'});
 }
 nav().addEventListener('click',event=>{
  const button=event.target.closest('[data-family-mobile-tab]');
  if(button)selectView(button.dataset.familyMobileTab,{scroll:true});
 });
 dayNav().addEventListener('click',event=>{
  const button=event.target.closest('[data-family-mobile-day]');
  if(!button)return;
  day=button.dataset.familyMobileDay;save();refreshDays();
 });
 options.addEventListener('click',event=>{
  if(event.target.closest('[data-family-mobile-range]')){
   day=day==='all'?'today':'all';
   save();refreshDays();options.open=false;
  }else if(event.target.closest('[data-family-mobile-weekend]')){
   // Only the existing guarded family UI changes the weekend state.
   document.getElementById('family-agenda-weekend-toggle').click();
   day='all';save();refreshDays();options.open=false;
  }
 });
 paintTabs();
 return {refreshDays,view:()=>view,selectView,
  selectCalendarDate:date=>{
   const index=days().findIndex(el=>el.dataset.date===date);
   if(index<0)return false;
   day=String(index);save();refreshDays();return true;
  },
  showAllDays:()=>{day='all';save();refreshDays();}};
}
