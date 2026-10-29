/** Device-local family UI; one source-grounded weekly plan per class. */
import {siteConfig} from './site-config.mjs';
import {schoolCalendar,DAYS} from './shared/calendar.mjs';
import {FAMILY_STORAGE_KEY,FAMILY_MAX_PROFILES,readFamily,familyDocument,putProfile,profileSummary,
 familyHighlights,schoolDayIndices} from './shared/family-core.mjs';
import {quizItems,buildQuizRounds} from './shared/word-quiz-core.mjs';
import {practiceKey,restorePractice,practiceSummary} from './shared/word-practice-core.mjs';

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
export function initFamilyUI({onModeChange,onOpenProfile,onOpenSingle}){
 let active=false,profiles=readFamily(read(FAMILY_STORAGE_KEY),siteConfig.schools);
 const plans=new Map(),loading=new Set(),errors=new Map();
 let run=0,editing=null,gradeRun=0;
 const calendar=()=>schoolCalendar(new Date(),'Europe/Oslo');
 const byId=id=>profiles.find(p=>p.id===id);
 const setStatus=message=>{el('family-form-status').textContent=message||'';};
 const persist=()=>{
  if(!write(FAMILY_STORAGE_KEY,familyDocument(profiles)))
   setStatus('Lagring er blokkert i nettleseren. Endringene kan forsvinne.');
 };
 function getSummaries(){
  const now=calendar(),summaries=new Map();
  for(const p of profiles)summaries.set(p.id,profileSummary(p,plans.get(p.id),now,read));
  return {now,summaries};
 }
 const taskList=(items,message)=>items.length?
  '<ul>'+items.slice(0,2).map(x=>'<li>'+escape((x.subject?x.subject+': ':'')+x.text)+'</li>').join('')+'</ul>':
  '<p class="family-muted">'+escape(message)+'</p>';
 function childCard(p,s,now){
  const school=siteConfig.schools[p.school];
  const pct=s.ready&&s.total?Math.round(100*s.done/s.total):0;
  const practice=s.ready?wordStatus(p,plans.get(p.id),now):null;
  const details=s.ready?[
   '<div class="family-child-progress"><div><span>Lekser denne uka</span><b>'+s.done+' / '+s.total+' fullført</b></div>',
   '<div class="family-progress-track" role="progressbar" aria-label="Fullført for '+escape(p.name)+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'"><span style="width:'+pct+'%"></span></div></div>',
   '<div class="family-child-columns"><div><h4>📚 I dag</h4>'+taskList(s.today,'Ingen lekser med frist i dag')+'</div>',
   '<div><h4>🎒 Neste skoledag</h4>'+taskList(s.next,s.nextIndex==null?'Neste uke er ikke hentet ennå':'Ingen lekser med frist')+'</div></div>',
   '<p class="family-word-state">'+(practice?'✦ Ordøving: '+practice.attempted+' / '+practice.total+(practice.weak?', '+practice.weak+' trenger øving':''):'✦ Ingen ordøving i denne ukeplanen')+'</p>'
  ].join(''):'<div class="family-not-ready" role="status">'+escape(errors.get(p.id)||s.reason||'Henter ukeplan …')+'</div>';
  return '<article class="family-child"><div class="family-child-heading">'+
   '<span class="family-avatar" aria-hidden="true">'+escape(p.name.slice(0,1).toUpperCase())+'</span>'+
   '<div><h3>'+escape(p.name)+'</h3><p>'+escape(school?.name||'Skole')+' · '+escape(p.grade)+'. klasse'+(p.group?' · '+escape(p.group):'')+'</p></div></div>'+
   details+'<div class="family-child-actions">'+
   '<button type="button" class="family-open" data-family-open="'+escape(p.id)+'">Åpne ukeplan →</button>'+
   '<button type="button" class="family-soft" data-family-edit="'+escape(p.id)+'">Endre</button>'+
   '<button type="button" class="family-remove" data-family-remove="'+escape(p.id)+'">Fjern</button>'+
   '</div></article>';
 }
 function render(){
  if(!active)return;
  const {now,summaries}=getSummaries();
  el('family-week').textContent='Uke '+now.week+' · '+now.year;
  el('family-count').textContent=profiles.length+' '+(profiles.length===1?'barn':'barn');
  el('family-add').disabled=profiles.length>=FAMILY_MAX_PROFILES;
  el('family-add').textContent=profiles.length>=FAMILY_MAX_PROFILES?'Maks seks barn':'+ Legg til barn';
  el('family-empty').hidden=profiles.length!==0;
  el('family-cards').innerHTML=profiles.map(p=>childCard(p,summaries.get(p.id),now)).join('');
  const {next}=schoolDayIndices(now);
  el('family-next-day').textContent=next==null?'Neste skoleuke':DAYS[next];
  const highlights=familyHighlights(profiles,summaries,now);
  el('family-reminders').innerHTML=next==null?
   '<p class="family-muted">Neste ukes oppgaver vises når ny ukeplan er publisert.</p>':
   highlights.length?highlights.map(x=>
    '<div class="family-reminder"><span aria-hidden="true">'+(x.type==='bag'?'🎒':x.type==='notice'?'💬':'📚')+
    '</span><div><strong>'+escape(x.name)+'</strong><p>'+escape(x.text)+'</p></div></div>').join(''):
    '<p class="family-muted">'+(loading.size?'Henter skolenes ukeplaner …':'Ingen lekser eller pakking registrert til neste skoledag.')+'</p>';
  el('family-load-status').textContent=loading.size?'Henter '+loading.size+' ukeplan(er) …':
   errors.size?'Noen ukeplaner kunne ikke hentes. Prøv Oppdater.':'';
 }
 let activeFetch=0;
 async function fetchPlans(){
  if(!active)return;
  const sequence=++run,now=calendar();loading.clear();errors.clear();
  for(const p of profiles)loading.add(p.id);
  render();
  const pairs=[...new Set(profiles.map(p=>p.school+'|'+p.grade))];
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(2,pairs.length)},async()=>{
   while(cursor<pairs.length){
    const pair=pairs[cursor++],[school,grade]=pair.split('|');
    let plan=null,error=null;
    try{plan=await getJson('/api/plan?school='+encodeURIComponent(school)+'&grade='+encodeURIComponent(grade),60000);}
    catch(e){error=e.message||'Klarte ikke hente ukeplan.';}
    if(sequence!==run||!active)return;
    for(const p of profiles.filter(x=>x.school===school&&x.grade===grade)){
     loading.delete(p.id);
     if(error||plan?.year!==now.year||plan?.week!==now.week){
      plans.delete(p.id);
      errors.set(p.id,error||'Skolens ukeplan gjelder ikke aktuell uke.');
     }else{plans.set(p.id,plan);errors.delete(p.id);}
    }
    render();
   }
  }));
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
  enter:()=>{if(active)return;active=true;render();onModeChange();void fetchPlans();},
  leave:()=>{active=false;run++;loading.clear();onModeChange();},
  refresh:()=>{if(active)void fetchPlans();}
 };
 el('family-add').addEventListener('click',()=>openForm());
 el('family-cancel').addEventListener('click',closeForm);
 el('family-refresh').addEventListener('click',api.refresh);
 el('family-return').addEventListener('click',()=>{api.leave();onOpenSingle();});
 el('family-school').addEventListener('change',()=>{setStatus('');void loadGrades();});
 el('family-form').addEventListener('submit',e=>{
  e.preventDefault();
  if(!el('family-school').value||!el('family-grade').value){setStatus('Velg skole og klassetrinn.');return;}
  const p={id:editing||crypto.randomUUID(),name:el('family-name').value,
   school:el('family-school').value,grade:el('family-grade').value,group:el('family-group').value};
  try{profiles=putProfile(profiles,p,siteConfig.schools);persist();closeForm();render();void fetchPlans();}
  catch(error){setStatus(error.message);}
 });
 el('family-cards').addEventListener('click',e=>{
  const open=e.target.closest('[data-family-open]');
  if(open){const p=byId(open.dataset.familyOpen);if(p)onOpenProfile(p);return;}
  const edit=e.target.closest('[data-family-edit]');
  if(edit){const p=byId(edit.dataset.familyEdit);if(p)openForm(p);return;}
  const remove=e.target.closest('[data-family-remove]');
  if(remove){
   const p=byId(remove.dataset.familyRemove);
   if(p&&confirm('Fjerne '+p.name+' fra familien? Avkrysninger på denne enheten slettes ikke.')){
    profiles=profiles.filter(x=>x.id!==p.id);plans.delete(p.id);loading.delete(p.id);
    persist();render();void fetchPlans();
   }
  }
 });
 window.addEventListener('storage',e=>{
  if(e.key!==FAMILY_STORAGE_KEY)return;
  profiles=readFamily(e.newValue,siteConfig.schools);
  if(active){render();void fetchPlans();}
 });
 return api;
}
