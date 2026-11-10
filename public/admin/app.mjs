/** Admin UI: normal Supabase OTP authentication, server-enforced administrator access.
 * Never place FEEDBACK_ADMIN_TOKEN in this application.
 */
import {CloudAccount,validSupabaseConfig} from '../shared/cloud-account.mjs';
import {siteConfig} from '../site-config.mjs';
const $=id=>document.getElementById(id);
const kinds={wrong_interpretation:'Feil i AI-tolking',wrong_date:'Feil dato',
 missing_notice:'Manglende beskjed',duplicate_homework:'Duplisert lekse',
 not_homework:'Ikke en lekse',missing_homework:'Manglende lekseinnhold'};
const states={new:'Ny',in_progress:'Under arbeid',resolved:'Løst'};
let account=null,reports=[],email='';
function message(value='',error=false){
 $('message').textContent=value;$('message').classList.toggle('error',error);
}
function showDashboard(visible){
 $('dashboard').hidden=!visible;$('login').hidden=visible;$('signout').hidden=!visible;
}
function html(tag,className,text){
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(text!=null)node.textContent=String(text);
 return node;
}
async function authorizedFetch(url,options={}){
 await account.ensureSession();
 const response=await fetch(url,{...options,cache:'no-store',
  headers:{Authorization:'Bearer '+account.session.access_token,
   Accept:'application/json',...(options.headers||{})}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok){
  const error=Error(data.error||'Kunne ikke kontakte administrasjonstjenesten.');
  error.status=response.status;throw error;
 }
 return data;
}
async function load(){
 message('Henter rapporter …');
 try{
  const data=await authorizedFetch('/api/admin-reports?days='+$('days').value);
  reports=Array.isArray(data.reports)?data.reports:[];
  render();
  message('Sist oppdatert '+new Date().toLocaleTimeString('nb-NO',{hour:'2-digit',minute:'2-digit'}));
 }catch(error){
  reports=[];render();message(error.message,true);
  if([401,403].includes(error.status))showDashboard(false);
 }
}
function makeReport(item){
 const section=html('article','report');
 const header=html('div','report-header'),heading=html('div');
 heading.append(html('h2','',siteConfig.schools[item.school]?.name||item.school||'Ukjent skole'));
 const date=item.submittedAt?new Date(item.submittedAt).toLocaleString('nb-NO',{
  day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Ukjent tidspunkt';
 heading.append(html('p','report-meta',date+' · '+(item.grade||'?')+'. trinn · Uke '+item.week+' · '+(kinds[item.kind]||'Rapport')));
 const tag=html('span','tag '+(item.reviewStatus||'new'),states[item.reviewStatus]||'Ny');
 header.append(heading,tag);section.append(header);
 const details=html('details','report-details');
 details.append(html('summary','','Vis rapportdetaljer'));
 const dl=html('dl');
 for(const [label,value] of [
  ['Feilbeskrivelse',item.details||'Ikke oppgitt'],
  ['Kildetekst',item.sourceText||'Ikke oppgitt'],
  ...(item.section?[['Seksjon',({homework:'Lekser',bag:'Pakkeliste',program:'Dagsprogram',notices:'Beskjeder',vocabulary:'Gloser','vocabulary-nb':'Norske øveord'}[item.section]||item.section)]]:[]),
  ...(item.target==='homework'?[['Rapportert element','Lekse #'+(Number(item.taskIndex)+1)],
    ['Fag',item.taskSubject||'Ikke oppgitt'],
    ['Frist',item.dueDay||'Ikke oppgitt'],
    ['Gjentakelsesdag',item.repeatDay||'Ikke oppgitt']]:[]),
  ['År / uke',String(item.year)+' / '+String(item.week)],
  ['PDF-side',item.sourcePage||'Ikke angitt']]){
  dl.append(html('dt','',label),html('dd','',value));
 }
 const pdf=typeof item.pdf==='string'?item.pdf:'';
 if(pdf){
  try{
   const url=new URL(pdf);
   if(url.protocol==='https:'&&['minskole.no','www.minskole.no','minskule.no','www.minskule.no'].includes(url.hostname)){
    const dt=html('dt','','Original-PDF'),dd=html('dd'),a=html('a','','Åpne original-PDF');
    a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';dd.append(a);dl.append(dt,dd);
   }
  }catch{/* malformed legacy record: do not link */}
 }
 details.append(dl);section.append(details);
 const actions=html('div','actions'),label=html('label','', 'Behandlingsstatus');
 const select=html('select');
 select.setAttribute('aria-label','Status for rapport '+(item.id||''));
 for(const [value,name] of Object.entries(states)){
  const option=html('option','',name);option.value=value;select.append(option);
 }
 select.value=states[item.reviewStatus]?item.reviewStatus:'new';
 select.addEventListener('change',async()=>{
  select.disabled=true;
  const previous=item.reviewStatus;
  try{
   const response=await authorizedFetch('/api/admin-reports',{
    method:'PATCH',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id:item.id,date:item.submittedAt.slice(0,10),status:select.value})
   });
   item.reviewStatus=response.status;render();message('Status oppdatert.');
  }catch(error){
   item.reviewStatus=previous;select.value=previous||'new';message(error.message,true);
  }finally{select.disabled=false;}
 });
 label.append(select);actions.append(label);section.append(actions);
 return section;
}
function render(){
 const total=reports.length;
 $('count-total').textContent=total;
 for(const [id,status] of [['count-new','new'],['count-progress','in_progress'],['count-done','resolved']])
  $(id).textContent=reports.filter(x=>(x.reviewStatus||'new')===status).length;
 const status=$('filter-status').value,kind=$('filter-kind').value,
  query=$('search').value.trim().toLocaleLowerCase('nb-NO');
 const filtered=reports.filter(x=>
  (status==='all'||(x.reviewStatus||'new')===status)&&
  (kind==='all'||x.kind===kind)&&
  (!query||[x.school,siteConfig.schools[x.school]?.name,x.grade,x.details,x.sourceText,x.taskSubject]
   .some(value=>String(value||'').toLocaleLowerCase('nb-NO').includes(query))));
 $('list-summary').textContent='Viser '+filtered.length+' av '+total+' rapporter';
 const target=$('reports');target.replaceChildren();
 if(!filtered.length){target.append(html('div','empty',total?
  'Ingen rapporter samsvarer med filtrene.':'Ingen rapporter er mottatt i valgt periode.'));return;}
 // Similar reports remain separate records with independent review statuses.
 const reportKey=item=>item.target==='homework'?
  [item.school,item.grade,item.year,item.week,item.taskSubject,item.sourceText,
   item.kind].join('::').toLocaleLowerCase('nb-NO'):null;
 const counts=new Map();
 for(const item of reports){const key=reportKey(item);if(key)counts.set(key,(counts.get(key)||0)+1);}
 const fragment=document.createDocumentFragment();
 for(const item of filtered){
  const card=makeReport(item),count=counts.get(reportKey(item))||0;
  if(count>1)card.querySelector('.report-meta')?.append(' · '+count+' lignende rapporter');
  fragment.append(card);
 }
 target.append(fragment);
}
async function boot(){
 try{
  const response=await fetch('/api/account-config',{cache:'no-store'});
  const config=await response.json();
  if(!response.ok||!config.enabled||!validSupabaseConfig(config))throw Error('Innlogging er ikke konfigurert.');
  account=new CloudAccount(config);
  if(account.isSignedIn()){
   message('Bekrefter innlogging …');
   const user=await account.restore();
   if(user){showDashboard(true);await load();return;}
  }
  message('');
 }catch(error){message(error.message,true);}
}
$('login-form').addEventListener('submit',async event=>{
 event.preventDefault();
 if(!account){message('Innlogging er ikke klar. Oppdater siden.',true);return;}
 email=$('email').value.trim();const button=$('send-code');button.disabled=true;
 try{await account.sendCode(email);$('login-form').hidden=true;$('verify-form').hidden=false;
  $('otp').focus();message('Sjekk e-posten din for engangskoden.');
 }catch(error){message(error.message,true);}
 finally{button.disabled=false;}
});
$('verify-form').addEventListener('submit',async event=>{
 event.preventDefault();const button=$('verify-code');button.disabled=true;
 try{await account.verifyCode(email,$('otp').value.trim());showDashboard(true);await load();}
 catch(error){message(error.message,true);}
 finally{button.disabled=false;}
});
$('back-email').addEventListener('click',()=>{$('verify-form').hidden=true;$('login-form').hidden=false;$('otp').value='';message('');});
$('days').addEventListener('change',()=>void load());
for(const id of ['filter-status','filter-kind','search'])$(id).addEventListener(id==='search'?'input':'change',render);
$('export').addEventListener('click',()=>{
 if(!reports.length){message('Det finnes ingen rapporter å eksportere.',true);return;}
 const data=JSON.stringify({exportedAt:new Date().toISOString(),
  periodDays:Number($('days').value),reports},null,2);
 const blob=new Blob([data],{type:'application/json'});
 const href=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=href;a.download='skoleuka-feilrapporter-'+new Date().toISOString().slice(0,10)+'.json';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);
 message('Rapportene er eksportert. Behandle filen som intern informasjon.');
});
$('refresh').addEventListener('click',()=>void load());
$('signout').addEventListener('click',async()=>{
 try{await account.signOut();}catch{account.signOutLocal();}
 reports=[];render();showDashboard(false);$('login-form').hidden=false;$('verify-form').hidden=true;
 $('otp').value='';message('Du er logget ut.');
});
void boot();
