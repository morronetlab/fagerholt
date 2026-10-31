/** Parent-only QR dialog. No pairing secret is stored or logged in the parent app. */
const $=id=>document.getElementById(id);
const e=s=>String(s??'').replace(/[&<>"']/gu,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
export function initChildPairingUI({getCloud}){
 const panel=$('child-pair-dialog');let child=null,previous=null,scrollY=0;
 const message=s=>{$('child-pair-status').textContent=s||'';};
 async function api(action,input=null){
  const cloud=getCloud();
  if(!cloud?.client||!cloud?.familyId)throw Error('Logg inn på familiekontoen først.');
  await cloud.client.ensureSession();
  const uri='/api/child-access'+(input===null?'?action='+action+'&childId='+encodeURIComponent(child.id):'');
  const r=await fetch(uri,{method:input===null?'GET':'POST',headers:{
   Authorization:'Bearer '+cloud.client.session.access_token,Accept:'application/json',
   ...(input!==null?{'Content-Type':'application/json'}:{})
  },body:input===null?undefined:JSON.stringify({action,...input}),cache:'no-store',referrerPolicy:'no-referrer'});
  const data=await r.json().catch(()=>null);
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
  previous?.focus?.({preventScroll:true});child=null;
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
   message('Tilgangen er fjernet.');await devices();
  }catch(err){button.disabled=false;message(err.message);}
 });
 return {open(profile){
  if(!getCloud()?.client?.isSignedIn()||!getCloud()?.familyId){
   alert('Logg inn i familiekontoen for å invitere barn.');return;
  }
  if(panel.open)return;
  child=profile;previous=document.activeElement;scrollY=window.scrollY;
  $('child-pair-title').textContent='Ukeplan til '+child.name;
  $('child-pair-intro').textContent='Skann QR-koden med telefonen eller nettbrettet til '+child.name+
   '. Barnet får kun sin egen ukeplan og egne/felles aktiviteter. Ingen foreldrekonto eller søskenprofiler.';
  panel.showModal();
  document.body.style.setProperty('--account-lock-top','-'+scrollY+'px');
  document.documentElement.classList.add('account-modal-open');
  document.body.classList.add('account-modal-open');
  $('child-pair-new').focus({preventScroll:true});
  void create();
 },close};
}
