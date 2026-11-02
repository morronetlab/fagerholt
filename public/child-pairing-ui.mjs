/** Parent-only QR dialog. No pairing secret is stored or logged in the parent app. */
import {childSetupInfo} from './shared/child-setup-state.mjs';
const $=id=>document.getElementById(id);
const e=s=>String(s??'').replace(/[&<>"']/gu,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
export function initChildPairingUI({getCloud,onStatusChange=()=>{}}){
 const panel=$('child-pair-dialog');let child=null,previous=null,scrollY=0;
 const setup=new Map();let statusVersion=0,statusFamilyId=null;
 let platform='ios',pollTimer=null,refreshing=false,qrExpiresAt=0,qrMode=null;
 const clearQr=()=>{
  qrExpiresAt=0;qrMode=null;
  $('child-pair-result').hidden=true;
  $('child-pair-link').value='';
  $('child-pair-qr').removeAttribute('src');
 };
 function setPlatform(next){
  if(next!=='ios'&&next!=='android')return;
  platform=next;
  for(const button of panel.querySelectorAll('[data-child-pair-platform]'))
   button.setAttribute('aria-pressed',String(button.dataset.childPairPlatform===next));
  const ios=next==='ios';
  $('child-pair-platform-instructions').querySelector('strong').textContent=ios?
   'Installer på iPad eller iPhone':'Installer på Android';
  $('child-pair-platform-instructions').querySelector('p').textContent=ios?
   'Skann QR-koden og åpne lenken i Safari. Velg Del → Legg til på Hjem-skjerm med «Åpne som webapp». Åpne så appikonet.':
   'Skann QR-koden og åpne lenken i Chrome. Velg Installer app eller Legg til på startskjermen. Åpne så appikonet.';
  $('child-pair-help-description').textContent=ios?
   'På iPad må QR-lenken åpnes i Safari før du legger den til på Hjem-skjerm. Safari og appikonet kan ha ulik lagring.':
   'På Android må Skoleuka åpnes via det installerte appikonet, ikke bare Chrome-fanen.';
 }
 function paintProgress(){
  if(!child||!panel.open)return;
  const info=childSetupInfo(getStatus(child.id));
  $('child-pair-stage-label').textContent=info.label;
  $('child-pair-stage-description').textContent=info.description;
  for(const [i,step] of [...panel.querySelectorAll('[data-child-pair-step]')].entries())
   step.dataset.state=i<info.step?'done':i===info.step?'active':'pending';
  if(qrExpiresAt&&Date.now()>=qrExpiresAt){
   clearQr();message('QR-koden har utløpt. Trykk «Lag ny QR-kode» hvis barnet ikke har skannet den.');
  }
  if(qrMode==='setup'&&['activated','installed'].includes(info.status)){
   clearQr();
   message(info.status==='installed'?
    'Appen er klar. Barnet kan åpne ukeplanen fra hjemskjermen.':
    'QR-koden er skannet! Åpne nå Skoleuka fra appikonet på barnets enhet.');
  }
  $('child-pair-new').textContent=info.status==='installed'?
   'Koble til en annen enhet':info.status==='not_invited'?
    'Lag QR-kode':'Lag ny QR-kode';
 }
 const getStatus=id=>setup.get(id)||'unknown';
 async function loadStatuses(profiles){
  const version=++statusVersion,cloud=getCloud();
  if(!cloud?.familyId){
   setup.clear();statusFamilyId=null;onStatusChange();return;
  }
  // Keep confirmed statuses during a refresh. New children have a deliberate
  // pending state rather than flashing "not invited" before the API responds.
  if(statusFamilyId!==cloud.familyId){setup.clear();statusFamilyId=cloud.familyId;}
  const ids=new Set(profiles.map(p=>p.id));
  for(const id of setup.keys())if(!ids.has(id))setup.delete(id);
  for(const id of ids)if(!setup.has(id))setup.set(id,'checking');
  onStatusChange();paintProgress();
  const updates=await Promise.all(profiles.map(async profile=>{
   try{
    const data=await api('status',null,true,profile.id);
    return [profile.id,['not_invited','invited','activated','installed'].includes(data.status)?
     data.status:'unknown'];
   }catch{return [profile.id,'unknown'];}
  }));
  if(version!==statusVersion||getCloud()?.familyId!==cloud.familyId)return;
  for(const [id,value] of updates){
   // On a network error preserve previously confirmed data, but do not
   // claim the child has never scanned a QR code.
   if(value!=='unknown'||['checking','unknown'].includes(getStatus(id)))
    setup.set(id,value);
  }
  onStatusChange();paintProgress();
 }
 function clearStatuses(){
  statusVersion++;statusFamilyId=null;setup.clear();onStatusChange();paintProgress();
 }
 async function refreshStatus(id){
  if(!getCloud()?.familyId)return;
  let next='unknown';
  try{
   const data=await api('status',null,true,id);
   if(['not_invited','invited','activated','installed'].includes(data.status))
    next=data.status;
  }catch{/* Unknown indicates that a status check failed, not revoked access. */}
  if(next==='unknown'&&!['checking','unknown'].includes(getStatus(id)))return;
  const changed=getStatus(id)!==next;
  setup.set(id,next);
  if(changed)onStatusChange();
  if(panel.open&&child?.id===id)paintProgress();
 }
 const message=s=>{$('child-pair-status').textContent=s||'';};
 async function api(action,input=null,retrySession=true,targetId=child?.id){
  const cloud=getCloud();
  if(!cloud?.client||!cloud?.familyId)throw Error('Logg inn på familiekontoen først.');
  try{await cloud.client.ensureSession();}
  catch{throw Error('Økten er utløpt. Lukk QR-vinduet, oppdater siden og logg inn på nytt.');}
  const uri='/api/child-access'+(input===null?'?action='+action+'&childId='+encodeURIComponent(targetId):'');
  const r=await fetch(uri,{method:input===null?'GET':'POST',headers:{
   Authorization:'Bearer '+cloud.client.session.access_token,Accept:'application/json',
   ...(input!==null?{'Content-Type':'application/json'}:{})
  },body:input===null?undefined:JSON.stringify({action,...input}),cache:'no-store',referrerPolicy:'no-referrer'});
  const data=await r.json().catch(()=>null);
  if(r.status===401&&retrySession){
   // Valid Supabase Auth tokens can become invalid when a session is
   // revoked before the JWT's exp timestamp. Try one refresh only.
   try{await cloud.client.refreshSession(true);}
   catch{throw Error('Økten er utløpt. Lukk QR-vinduet, oppdater siden og logg inn på nytt.');}
   return api(action,input,false,targetId);
  }
  if(r.status===401)throw Error('Økten er utløpt. Lukk QR-vinduet, oppdater siden og logg inn på nytt.');
  if(!r.ok)throw Error(data?.error||'Kunne ikke opprette barnetilgang.');
  return data;
 }
 async function devices(){
  try{
   const list=(await api('devices'))?.devices||[];
   const active=list.filter(x=>!x.revoked_at&&Date.parse(x.expires_at)>Date.now());
   $('child-pair-devices').innerHTML=active.length?active.map((item,i)=>
    '<div class="child-pair-device"><div><strong>Enhet '+(i+1)+'</strong><small>Aktivert '+
    e(new Date(item.created_at).toLocaleDateString('nb-NO'))+
    ' · '+(item.installed_at?'App åpnet fra hjemskjerm':'App ikke bekreftet installert')+
    ' · Tilgang utløper '+e(new Date(item.expires_at).toLocaleDateString('nb-NO'))+
    '</small></div><button type="button" data-child-revoke="'+e(item.id)+'">Fjern tilgang</button></div>').join(''):
    '<p class="family-muted">Ingen aktive barneenheter ennå.</p>';
  }catch(err){$('child-pair-devices').textContent=err.message;}
 }
 async function create(){
  if(!child||!panel.open)return;
  const targetId=child.id;
  $('child-pair-new').disabled=true;
  clearQr();
  message('Lager privat QR-kode …');
  try{
   const result=await api('create',{childId:targetId});
   if(!panel.open||child?.id!==targetId)return;
   if(!result.link?.startsWith(location.origin+'/barn/?pair=')||
      !result.qr?.startsWith('data:image/svg+xml;base64,'))
    throw Error('QR-koden kunne ikke vises.');
   $('child-pair-qr').src=result.qr;
   $('child-pair-qr').alt='Skann for å åpne ukeplanen til '+child.name;
   $('child-pair-link').value=result.link;
   qrExpiresAt=Date.parse(result.expiresAt)||Date.now()+10*60_000;
   qrMode=['installed','activated'].includes(getStatus(child.id))?'additional':'setup';
   $('child-pair-result').hidden=false;
   message('QR-koden er klar. Skann den med barnets enhet innen 10 minutter.');
   if(!['installed','activated'].includes(getStatus(child.id))){
    setup.set(child.id,'invited');onStatusChange();
   }
   paintProgress();
   void devices();
  }catch(err){if(panel.open&&child?.id===targetId)message(err.message);}
  finally{if(panel.open&&child?.id===targetId)$('child-pair-new').disabled=false;}
 }
 async function checkNow(){
  if(!panel.open||!child||refreshing)return;
  refreshing=true;$('child-pair-check').disabled=true;
  const id=child.id;
  try{
   await refreshStatus(id);
   if(panel.open&&child?.id===id)await devices();
  }finally{
   refreshing=false;$('child-pair-check').disabled=false;
  }
 }
 async function initialize(id){
  await checkNow();
  if(!panel.open||child?.id!==id)return;
  const current=getStatus(id);
  if(current==='not_invited')void create();
  else if(current==='invited')
   message('En QR-kode er allerede laget. Av sikkerhetsgrunner kan den ikke åpnes igjen. Lag en ny hvis barnet trenger den.');
  else if(current==='activated')
   message('QR-koden er skannet. Neste steg er å starte appen fra hjemskjermen.');
  else if(current==='installed')
   message('Appen er installert. Du kan administrere enhetene nedenfor.');
  else message('Vi kunne ikke sjekke status. Prøv «Sjekk status» eller åpne «Trenger hjelp?».');
 }
 function stopPolling(){if(pollTimer)clearInterval(pollTimer);pollTimer=null;}
 function startPolling(){
  stopPolling();
  pollTimer=setInterval(()=>{
   if(panel.open&&document.visibilityState==='visible')void checkNow();
  },5000);
 }
 function close(){
  if(panel.open)panel.close();
 }
 panel.addEventListener('close',()=>{
  stopPolling();clearQr();
  document.documentElement.classList.remove('account-modal-open');
  document.body.classList.remove('account-modal-open');
  document.body.style.removeProperty('--account-lock-top');
  window.scrollTo({top:scrollY,behavior:'instant'});
  const id=child?.id;
  previous?.focus?.({preventScroll:true});child=null;
  if(id)void refreshStatus(id);
  $('child-pair-help').open=false;
 });
 $('child-pair-close').addEventListener('click',close);
 $('child-pair-new').addEventListener('click',()=>void create());
 $('child-pair-check').addEventListener('click',()=>void checkNow());
 panel.querySelector('.child-pair-platform').addEventListener('click',event=>{
  const button=event.target.closest('[data-child-pair-platform]');
  if(button)setPlatform(button.dataset.childPairPlatform);
 });
 document.addEventListener('visibilitychange',()=>{
  if(panel.open&&document.visibilityState==='visible')void checkNow();
 });
 $('child-pair-copy').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText($('child-pair-link').value);message('Lenken er kopiert.');}
  catch{message('Velg lenken i feltet og kopier manuelt.');}
 });
 $('child-pair-devices').addEventListener('click',async event=>{
  const button=event.target.closest('[data-child-revoke]');if(!button||!child)return;
  if(!confirm('Vil du fjerne denne enhetens tilgang til barnets ukeplan?'))return;
  button.disabled=true;
  try{await api('revoke',{childId:child.id,deviceId:button.dataset.childRevoke});
   message('Tilgangen er fjernet.');await devices();await refreshStatus(child.id);
  }catch(err){button.disabled=false;message(err.message);}
 });
 return {getStatus,loadStatuses,refreshStatus,clearStatuses,open(profile,{showHelp=false}={}){
  if(!getCloud()?.client?.isSignedIn()||!getCloud()?.familyId){
   alert('Logg inn i familiekontoen for å invitere barn.');return;
  }
  if(panel.open)return;
  child=profile;previous=document.activeElement;scrollY=window.scrollY;
  $('child-pair-title').textContent='Installer Skoleuka for '+child.name;
  $('child-pair-intro').textContent='1. Skann QR-koden på enheten til '+child.name+
   '. 2. Åpne ukeplanen og legg den på Hjem-skjerm. 3. Start appikonet. Barnet ser bare sin egen ukeplan.';
  clearQr();message('Sjekker status …');
  $('child-pair-new').disabled=true;
  $('child-pair-help').open=showHelp;
  setPlatform(platform);
  panel.showModal();paintProgress();
  document.body.style.setProperty('--account-lock-top','-'+scrollY+'px');
  document.documentElement.classList.add('account-modal-open');
  document.body.classList.add('account-modal-open');
  $('child-pair-close').focus({preventScroll:true});
  void initialize(child.id);startPolling();
 },close};
}
