import {CloudAccount} from '/shared/cloud-account.mjs';

const $=id=>document.getElementById(id);
const supportedHost=()=>location.protocol==='https:'&&
 ['deploy-preview-172--ukeplanen.netlify.app','www.skoleuka.no'].includes(location.hostname);
let cloud=null,selectedRequest=null,childId='',linked=false;

const message=text=>{$('status').textContent=text};
function buttons(){
 const hasChild=Boolean(childId&&cloud);
 $('create').disabled=!hasChild||linked;
 $('refresh').disabled=!hasChild;
 $('approve').disabled=!hasChild||!selectedRequest||!/^[0-9]{6}$/.test($('pin').value)||linked;
 $('revoke').disabled=!hasChild||!linked;
}
async function api(action,body=null){
 if(!cloud)throw Error('Logg inn som foresatt først.');
 await cloud.ensureSession();
 const path='/api/feide-child-link?action='+encodeURIComponent(action)+
   (body===null?'&childId='+encodeURIComponent(childId):'');
 const res=await fetch(path,{method:body===null?'GET':'POST',
  cache:'no-store',referrerPolicy:'no-referrer',
  headers:{Authorization:'Bearer '+cloud.session.access_token,Accept:'application/json',
    ...(body!==null?{'Content-Type':'application/json'}:{})},
  body:body===null?undefined:JSON.stringify({...body,childId})});
 const json=await res.json().catch(()=>null);
 if(!res.ok)throw Error(json?.error||'Kunne ikke fullføre.');
 return json;
}
async function refresh(){
 if(!childId)return;
 const data=await api('status');
 linked=data.linked===true;
 selectedRequest=null;
 const host=$('request-list');host.replaceChildren();
 const pending=Array.isArray(data.pending)?data.pending:[];
 const valid=pending.filter(r=>r.status==='awaiting-parent-confirmation'&&!r.locked);
 if(valid.length&&!linked){
  const label=document.createElement('label');
  label.textContent='Invitasjon barnet har bekreftet: ';
  const select=document.createElement('select');
  select.setAttribute('aria-label','Velg Feide-koblingsforespørsel');
  for(const r of valid){
   const option=document.createElement('option');
   option.value=r.requestId;
   option.textContent='Venter på kode · utløper '+new Date(r.expiresAt).toLocaleTimeString('nb-NO');
   select.appendChild(option);
  }
  selectedRequest=valid[0].requestId;
  select.addEventListener('change',()=>{selectedRequest=select.value;buttons()});
  label.appendChild(select);host.appendChild(label);
 }else{
  const p=document.createElement('p');
  p.className='muted';
  p.textContent=linked?'Feide-koblingen er godkjent. Ingen flere bekreftelser trengs.':
    pending.length?'Venter på at barnet logger inn med Feide. Oppdater etter innlogging.':
    'Ingen aktive invitasjoner.';
  host.appendChild(p);
 }
 $('linked').textContent=linked?'Feide-identitet er koblet til dette barnet.':'Ingen aktiv Feide-kobling.';
 buttons();
}
async function init(){
 if(!supportedHost()){
  message('Feide-kobling er ikke tilgjengelig her.');return;
 }
 try{
  const auth=await fetch('/api/feide-oidc/status',{cache:'no-store',credentials:'same-origin'});
  if(!auth.ok||(await auth.json()).ready!==true)
   throw Error('Feide-innlogging er ikke aktivert på denne adressen.');
  const response=await fetch('/api/account-config',{cache:'no-store'});
  const config=await response.json();
  if(!config.enabled)throw Error('Supabase er ikke aktivert for denne previewen.');
  // PR #170 uses the existing family in Supabase with explicit guardian
  // approval. The Feide child still receives NO family-data access.
  if(new URL(config.url).hostname!=='qxejliyfgfeigvxsqupg.supabase.co')
   throw Error('Feide-testen må være koblet til Skoleukas Supabase-prosjekt.');
  cloud=new CloudAccount({url:config.url,publishableKey:config.publishableKey});
  const parent=await cloud.restore();
  if(!parent?.id)throw Error('Logg inn som foresatt på denne forhåndsvisningen først.');
  const children=await cloud.rows('children','select=id,nickname,grade,school_id&order=nickname.asc');
  if(!Array.isArray(children)||!children.length)throw Error('Fant ingen barneprofiler for familiekontoen.');
  for(const child of children){
   const option=document.createElement('option');
   option.value=child.id;
   option.textContent=child.nickname+' · '+child.grade+'. trinn';
   $('child').appendChild(option);
  }
  $('child').disabled=false;
  message('Velg barnet som skal knyttes til Feide-testkontoen.');
 }catch(err){message(err.message||'Kunne ikke laste familiekonto.');}
}
$('child').addEventListener('change',async()=>{
 childId=$('child').value; selectedRequest=null;linked=false;
 $('invite').hidden=true;$('pin').value='';buttons();
 if(childId)try{await refresh();}catch(err){message(err.message);}
});
$('create').addEventListener('click',async()=>{
 if(!childId)return;
 $('create').disabled=true;message('Oppretter engangslenke …');
 try{
  const r=await api('create',{});
  $('link').value=r.link;$('invite').hidden=false;
  message('Engangslenken er klar. Del den med barnet og be om bekreftelseskoden.');
  await refresh();
 }catch(err){message(err.message);}finally{buttons();}
});
$('copy').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText($('link').value);message('Koblingslenken er kopiert.');}
 catch{message('Kopier koblingslenken manuelt fra feltet.');}
});
$('refresh').addEventListener('click',async()=>{try{await refresh();}catch(err){message(err.message);}});
$('pin').addEventListener('input',buttons);
$('approve').addEventListener('click',async()=>{
 if(!selectedRequest||!/^[0-9]{6}$/.test($('pin').value))return;
 if(!confirm('Bekrefter du at koden kommer fra barnets egen Feide-innlogging?'))return;
 $('approve').disabled=true;
 try{
  await api('approve',{requestId:selectedRequest,code:$('pin').value});
  $('pin').value='';message('Feide-koblingen er godkjent. Barnets QR-tilgang er uendret.');
  await refresh();
 }catch(err){message(err.message);buttons();}
});
$('revoke').addEventListener('click',async()=>{
 if(!linked||!confirm('Fjerne den godkjente Feide-koblingen fra dette barnet?'))return;
 $('revoke').disabled=true;
 try{await api('revoke',{});message('Feide-koblingen er fjernet.');await refresh();}
 catch(err){message(err.message);buttons();}
});
void init();
