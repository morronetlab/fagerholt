/** Personal and family-shared activity editor for the weekly family view.
 * A signed-in family uses only Supabase/PostgREST + RLS. Signed-out users
 * keep a separate device-local plan, never silently uploaded to another family.
 */
import {activityDayLabel,activityOccurrences,activityScopeLabel,activityTimeLabel,
 familyActivityWeekDates,normalizeActivityDraft,FAMILY_ACTIVITY_MAX} from './shared/family-activities.mjs';
import {contentCategoryLabel} from './shared/content-categories.mjs';

export const LOCAL_ACTIVITY_KEY='ukeplanen.family.activities.v1';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/gu,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
function localRead(){
 try{
  const raw=JSON.parse(localStorage.getItem(LOCAL_ACTIVITY_KEY)||'[]');
  return Array.isArray(raw)?raw.filter(x=>x&&typeof x.id==='string'&&
   typeof x.title==='string'&&typeof x.occurs_on==='string').slice(0,FAMILY_ACTIVITY_MAX):[];
 }catch{return [];}
}
function localWrite(items){
 localStorage.setItem(LOCAL_ACTIVITY_KEY,JSON.stringify(items.slice(0,FAMILY_ACTIVITY_MAX)));
}
const fieldMap={
 title:'family-activity-name',child_id:'family-activity-child',
 occurs_on:'family-activity-date',start_time:'family-activity-start',
 end_time:'family-activity-end',repeat_rule:'family-activity-repeat',
 repeat_until:'family-activity-until',location:'family-activity-location',
 responsible:'family-activity-responsible',notes:'family-activity-notes'
};
export function initFamilyActivitiesUI({getProfiles,getCloud,getCalendar,onChange=()=>{}}){
 let active=false,rows=localRead(),editing=null,loading=false,status='',request=0,weekKey='';
 const form=$('family-activity-form'),save=$('family-activity-save'),
  panel=$('family-activity-list');
 const setMessage=msg=>{status=msg;};
 const getWeek=()=>{const c=getCalendar();return c.year+'-'+c.week;};
 const isCloud=()=>Boolean(getCloud()?.client&&getCloud()?.familyId);
 function render(){
  if(!active)return;
  const profiles=getProfiles(),c=getCalendar(),items=activityOccurrences(rows,c.year,c.week);
  $('family-activity-manage-summary').textContent=items.length?
   'Vis og administrer '+items.length+' aktivitet'+(items.length===1?'':'er')+' denne uka':
   'Ingen aktiviteter denne uka · Vis administrasjon';
  $('family-activity-status').textContent=status||
   (loading?'Henter familiens aktiviteter …':isCloud()?
    'Delt mellom foresatte i familiekontoen · trykk Oppdater for å hente endringer.':
    'Lagres bare på denne enheten. Logg inn under Min konto for å dele aktiviteter.');
  const values=profiles.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>');
  const select=$('family-activity-child'),selected=select.value;
  const options='<option value="">Hele familien</option>'+values.join('');
  if(select.innerHTML!==options){select.innerHTML=options;
   select.value=profiles.some(p=>p.id===selected)?selected:'';}
  $('family-activity-repeat').value=$('family-activity-repeat').value||'none';
  if(!items.length){
   panel.innerHTML='<p class="family-activity-empty">'+(loading?'Henter aktiviteter …':
    'Ingen aktiviteter registrert for denne uka. Legg til trening, korps eller en avtale.')+'</p>';
   return;
  }
  const groups=new Map();
  for(const item of items){
   if(!groups.has(item.date))groups.set(item.date,[]);
   groups.get(item.date).push(item);
  }
  panel.innerHTML=[...groups].map(([date,list])=>
   '<div class="family-activity-day"><h3>'+esc(activityDayLabel(date))+'</h3>'+
   list.map(item=>
    '<article class="family-activity-card content-kind-activity">'+
     '<div class="family-activity-clock">'+esc(activityTimeLabel(item))+'</div>'+
     '<div class="family-activity-details"><span class="content-type-label content-kind-activity">'+contentCategoryLabel('activity')+'</span><strong>'+esc(item.title)+'</strong>'+
     '<span>'+esc(activityScopeLabel(item,profiles))+
       (item.repeat_rule==='weekly'?' · Ukentlig ↻':'')+'</span>'+
     (item.location?'<p>📍 '+esc(item.location)+'</p>':'')+
     (item.responsible?'<p>Ansvarlig: '+esc(item.responsible)+'</p>':'')+
     (item.notes?'<p>'+esc(item.notes)+'</p>':'')+'</div>'+
     '<div class="family-activity-actions">'+
      '<button type="button" data-activity-edit="'+esc(item.id)+'" aria-label="Endre '+esc(item.title)+'">Endre</button>'+
      '<button type="button" data-activity-delete="'+esc(item.id)+'" aria-label="Slett '+esc(item.title)+'">Slett</button>'+
     '</div></article>').join('')+'</div>').join('');
 }
 function formStatus(message){$('family-activity-form-status').textContent=message||'';}
 function resetForm(){
  editing=null;form.reset();form.hidden=true;formStatus('');
  $('family-activity-until-wrap').hidden=true;
 }
 function openForm(item=null){
  editing=item?.id||null;
  // Editing is the primary task: temporarily minimize the redundant list.
  $('family-activity-manage').open=false;
  form.hidden=false;formStatus('');
  const c=getCalendar();
  const defaults={title:'',child_id:'',occurs_on:familyActivityWeekDates(c.year,c.week).start,
   start_time:'',end_time:'',repeat_rule:'none',repeat_until:'',location:'',responsible:'',notes:''};
  for(const [key,id] of Object.entries(fieldMap))
   $(id).value=item?.[key]||defaults[key];
  // Avoid displaying a removed child as a still-editable owner.
  $('family-activity-child').value=item?.child_id&&getProfiles().some(p=>p.id===item.child_id)?
   item.child_id:'';
  $('family-activity-form-title').textContent=item?'Endre aktivitet':'Ny aktivitet';
  save.textContent=item?'Lagre endringer':'Lagre aktivitet';
  $('family-activity-until-wrap').hidden=$('family-activity-repeat').value!=='weekly';
  $('family-activity-name').focus({preventScroll:true});
  form.scrollIntoView({block:'nearest',behavior:'smooth'});
 }
 async function refresh(){
  if(!active)return;
  const seq=++request,c=getCalendar(),key=getWeek(),cloud=getCloud();
  weekKey=key;
  if(!cloud){rows=localRead();loading=false;setMessage('');render();onChange();return;}
  loading=true;setMessage('');render();
  try{
   const data=await cloud.client.activities(cloud.familyId,c.year,c.week);
   if(seq!==request||getCloud()!==cloud||getWeek()!==key||!active)return;
   rows=Array.isArray(data)?data:[];loading=false;setMessage('');render();onChange();
  }catch(error){
   if(seq!==request||getCloud()!==cloud||!active)return;
   loading=false;rows=[];setMessage('Kunne ikke hente aktivitetene: '+error.message);
   render();onChange();
  }
 }
 function changedFamily(){
  request++;resetForm();rows=[];loading=false;status='';
  if(active)void refresh();
 }
 $('family-activity-add').addEventListener('click',()=>openForm());
 $('family-activity-cancel').addEventListener('click',resetForm);
 $('family-activity-repeat').addEventListener('change',()=>{
  const repeat=$('family-activity-repeat').value==='weekly';
  $('family-activity-until-wrap').hidden=!repeat;
  if(!repeat)$('family-activity-until').value='';
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(loading)return;
  let draft;
  try{
   const values=Object.fromEntries(Object.entries(fieldMap).map(([key,id])=>[key,$(id).value]));
   draft=normalizeActivityDraft(values,getProfiles().map(p=>p.id));
  }catch(error){formStatus(error.message);return;}
  const existing=rows.find(x=>x.id===editing),cloud=getCloud(),id=editing;
  save.disabled=true;formStatus('Lagrer aktivitet …');
  try{
   if(cloud){
    if(id&&existing)await cloud.client.updateActivity(cloud.familyId,id,draft);
    else await cloud.client.createActivity(cloud.familyId,draft);
    resetForm();await refresh();
   }else{
    if(!id&&rows.length>=FAMILY_ACTIVITY_MAX)throw Error('Maks '+FAMILY_ACTIVITY_MAX+' lokale aktiviteter.');
    const saved={...draft,id:id||crypto.randomUUID(),created_at:existing?.created_at||new Date().toISOString()};
    rows=id?rows.map(x=>x.id===id?saved:x):[...rows,saved];
    localWrite(rows);resetForm();setMessage('Aktiviteten er lagret på denne enheten.');render();onChange();
   }
  }catch(error){formStatus('Kunne ikke lagre: '+error.message);}
  finally{save.disabled=false;}
 });
 panel.addEventListener('click',async event=>{
  const edit=event.target.closest('[data-activity-edit]'),
   remove=event.target.closest('[data-activity-delete]');
  const id=edit?.dataset.activityEdit||remove?.dataset.activityDelete;
  if(!id)return;
  const item=rows.find(x=>x.id===id);
  if(!item)return;
  if(edit){openForm(item);return;}
  if(!window.confirm('Slette «'+item.title+'»'+
   (item.repeat_rule==='weekly'?' og alle gjentakelsene':'')+'?'))return;
  const cloud=getCloud();if(cloud){
   try{
    await cloud.client.deleteActivity(cloud.familyId,id);await refresh();
   }catch(error){setMessage('Kunne ikke slette aktiviteten: '+error.message);render();}
  }else{
   rows=rows.filter(x=>x.id!==id);
   try{localWrite(rows);setMessage('Aktiviteten er slettet.');}
   catch(error){setMessage('Kunne ikke lagre slettingen: '+error.message);}
   render();onChange();
  }
 });
 window.addEventListener('storage',event=>{
  if(!active||isCloud()||event.key!==LOCAL_ACTIVITY_KEY)return;
  rows=localRead();render();onChange();
 });
 return {
  getRows:()=>weekKey===getWeek()?rows:[],
  editActivity:id=>{const found=rows.find(item=>item.id===id);if(found)openForm(found);},
  enter(){active=true;void refresh();},
  leave(){active=false;request++;resetForm();},
  onFamilyChanged:changedFamily,
  refresh,
  render(){
   if(!active)return;
   if(weekKey!==getWeek()){void refresh();return;}
   render();
  }
 };
}
