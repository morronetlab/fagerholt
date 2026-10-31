/** Mobile-only navigation for the family dashboard.
 * Desktop keeps all sections and all seven calendar days visible.
 * No account, task or local homework state is changed.
 */
const KEY='skoleuka.family.mobile.v1';
const VIEWS=new Set(['overview','calendar','activities']);
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
 function paintTabs(){
  root().dataset.familyMobileView=view;
  for(const button of nav().querySelectorAll('[data-family-mobile-tab]')){
   const active=button.dataset.familyMobileTab===view;
   button.setAttribute('aria-pressed',String(active));
  }
 }
 function refreshDays(){
  const list=days();
  const current=list.findIndex(el=>el.classList.contains('today'));
  const chosen=day==='all'?-1:day==='today'?
   (current>=0?current:0):Math.min(Number(day),Math.max(0,list.length-1));
  const select=day==='all'?'all':String(chosen);
  dayNav().innerHTML='<button type="button" data-family-mobile-day="all" aria-pressed="'+
   String(select==='all')+'">Alle dager</button>'+
   list.map((el,index)=>{
    const heading=el.querySelector('h3')?.textContent||'Dag '+(index+1);
    const abbreviated=heading.trim().split(' ')[0].slice(0,3);
    const count=el.querySelectorAll('.family-agenda-item').length;
    return '<button type="button" data-family-mobile-day="'+index+'" aria-pressed="'+
      String(select===String(index))+'" aria-label="'+(index<5?'Skoledag ':'Dag ')+
      (index+1)+'">'+abbreviated+' <span class="family-mobile-day-count">'+count+
      '</span></button>';
   }).join('');
  list.forEach((el,index)=>el.classList.toggle('family-mobile-day-hidden',
   chosen!==-1&&index!==chosen));
 }
 nav().addEventListener('click',event=>{
  const button=event.target.closest('[data-family-mobile-tab]');
  if(!button||!VIEWS.has(button.dataset.familyMobileTab))return;
  view=button.dataset.familyMobileTab;save();paintTabs();
  if(mobile())root().scrollIntoView({block:'start',behavior:'auto'});
 });
 dayNav().addEventListener('click',event=>{
  const button=event.target.closest('[data-family-mobile-day]');
  if(!button)return;
  day=button.dataset.familyMobileDay;save();refreshDays();
 });
 paintTabs();
 return {refreshDays,view:()=>view};
}
