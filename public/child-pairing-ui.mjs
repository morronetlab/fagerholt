/** Parent-only QR dialog. No pairing secret is stored or logged in the parent app. */
const $=id=>document.getElementById(id);
const e=s=>String(s??'').replace(/[&<>"']/gu,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
export function initChildPairingUI({getCloud,onStatusChange=()=>{}}){
 const panel=$('child-pair-dialog');let child=null,previous=null,scrollY=0;
 const setup=new Map();let statusVersion=0;
 const getStatus=id=>setup.get(id)||'unknown';
 async function loadStatuses(profiles){
  const version=++statusVersion;
  if(!getCloud()?.familyId){setup.clear();onStatusChange();return;}
  const updates=await Promise.all(profiles.map(async profile=>{
   try{
    const data=await api('status',null,true,profile.id);
    return [profile.id,['not_invited','invited','activated','installed'].includes(data.status)?
     data.status:'unknown'];
   }catch{return [profile.id,'unknown'];}
  }));
  if(version!==statusVersion)return;
  setup.clear();for(const [id,value] of updates)setup.set(id,value);
  onStatusChange();
 }
 function clearStatuses(){statusVersion++;setup.clear();onStatusChange();}
 async function refreshStatus(id){
  if(!getCloud()?.familyId)return;
  try{
   const data=await api('status',null,true,id);
   setup.set(id,['not_invited','invited','activated','installed'].includes(data.status)?
    data.status:'unknown');
  }catch{setup.set(id,'unknown');}
  onStatusChange();
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
  $('child-pair-new').disabled=true;
  $('child-pair-result').hidden=true;
  $('child-pair-link').value='';
  $('child-pair-qr').removeAttribute('src');
  message('Lager privat QR-kode …');
  try{
   const result=await api('create',{childId:child.id});
   if(!result.link?.startsWith(location.origin+'/barn/?pair=')||
      !result.qr?.startsWith('data:image/svg+xml;base64,'))
    throw Error('QR-koden kunne ikke vises.');
   $('child-pair-qr').src=result.qr;
   $('child-pair-qr').alt='Skann for å åpne ukeplanen til '+child.name;
   $('child-pair-link').value=result.link;
   $('child-pair-result').hidden=false;
   message('Klar! Skann QR-koden med barnets enhet. Koden er gyldig i 10 minutter.');
   if(!['installed','activated'].includes(getStatus(child.id))){
    setup.set(child.id,'invited');onStatusChange();
   }
   void devices();
  }catch(err){message(err.message);}
  finally{$('child-pair-new').disabled=false;}
 }
 function close(){
  if(panel.open)panel.close();
 }
 panel.addEventListener('close',()=>{
  document.documentElement.classList.remove('account-modal-open');
  document.body.classList.remove('account-modal-open');
  document.body.style.removeProperty('--account-lock-top');
  window.scrollTo({top:scrollY,behavior:'instant'});
  const id=child?.id;
  previous?.focus?.({preventScroll:true});child=null;
  if(id)void refreshStatus(id);
  $('child-pair-result').hidden=true;$('child-pair-link').value='';
  $('child-pair-qr').removeAttribute('src');
 });
 $('child-pair-close').addEventListener('click',close);
 $('child-pair-new').addEventListener('click',()=>void create());
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
 return {getStatus,loadStatuses,refreshStatus,clearStatuses,open(profile){
  if(!getCloud()?.client?.isSignedIn()||!getCloud()?.familyId){
   alert('Logg inn i familiekontoen for å invitere barn.');return;
  }
  if(panel.open)return;
  child=profile;previous=document.activeElement;scrollY=window.scrollY;
  $('child-pair-title').textContent='Ukeplan til '+child.name;
  $('child-pair-intro').textContent='1. Skann QR-koden på telefonen til '+child.name+
   '. 2. Åpne ukeplanen og legg den til på hjemskjermen. 3. Start appen fra hjemskjermen for å bekrefte oppsettet. Barnet ser bare sin egen ukeplan.';
  panel.showModal();
  document.body.style.setProperty('--account-lock-top','-'+scrollY+'px');
  document.documentElement.classList.add('account-modal-open');
  document.body.classList.add('account-modal-open');
  $('child-pair-new').focus({preventScroll:true});
  void create();
 },close};
}
