/** Ukeplanen 2.1 guardian account interface.
 * Account and family actions require a properly configured Supabase project.
 * Unconfigured preview always retains the existing offline/local family app.
 */
import {CloudAccount,validSupabaseConfig} from './shared/cloud-account.mjs';
import {importCurrentLocalFamily} from './shared/family-import.mjs';
import {FAMILY_STORAGE_KEY,readFamily} from './shared/family-core.mjs';
import {schoolCalendar} from './shared/calendar.mjs';
import {siteConfig} from './site-config.mjs';
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=k=>{try{return localStorage.getItem(k);}catch{return null;}};
const invitationsFromUrl=()=>{
 const fragment=new URLSearchParams(location.hash.slice(1)),token=fragment.get('invite');
 if(!token)return null;
 history.replaceState(null,'',location.pathname+location.search);
 return /^[a-f0-9]{64}$/.test(token)?token:null;
};
export function initAccountUI({familyUI}){
 let client=null,accountReady=false,requestedEmail='',familyId=null,families=[],invitation=invitationsFromUrl(),nextCodeRequestAt=0;
 const status=(msg,error=false)=>{$('account-message').textContent=msg||'';$('account-message').dataset.error=String(error);};
 const show=id=>{for(const section of $('account-panel').querySelectorAll('[data-account-screen]'))
   section.hidden=section.dataset.accountScreen!==id;};
 const button=$('account-button');
 const unconfigured=()=>{
  show('missing');button.textContent='Konto';accountReady=false;
 };
 function displaySignedIn(){
  button.textContent='Min konto';
  $('account-user-email').textContent=client.session?.user?.email||requestedEmail||'Innlogget forelder';
  $('account-current-family').textContent=familyId&&families.find(f=>f.id===familyId)?.name||'Ingen familie valgt';
 }
 async function syncFamilies(preferred=null){
  families=await client.families();
  const selected=preferred&&families.some(x=>x.id===preferred)?preferred:
    familyId&&families.some(x=>x.id===familyId)?familyId:families[0]?.id||null;
  familyId=selected;
  $('account-family-picker').replaceChildren(new Option('Velg familie',''));
  for(const f of families)$('account-family-picker').add(new Option(f.name,f.id));
  $('account-family-picker').value=familyId||'';
  $('account-empty-family').hidden=Boolean(familyId);
  $('account-family-tools').hidden=!familyId;
  $('account-invite-accept').hidden=!invitation;
  const owner=familyId&&families.find(f=>f.id===familyId)?.created_by===client.session?.user?.id;
  $('account-delete-family').hidden=!owner;
  $('account-leave-family').hidden=!familyId||Boolean(owner);
  if(familyId){
   const children=await client.children(familyId);
   await familyUI.setCloud(client,familyId,children);
   const local=readFamily(read(FAMILY_STORAGE_KEY),siteConfig.schools);
   $('account-import').hidden=!local.length;
   familyUI.enter();
  }else familyUI.clearCloud();
  displaySignedIn();
  show('signed');
 }
 async function restore(){
  try{
   const res=await fetch('/api/account-config',{cache:'no-store'});
   const cfg=await res.json();
   if(!res.ok||!cfg.enabled||!validSupabaseConfig(cfg)){unconfigured();return;}
   client=new CloudAccount(cfg);accountReady=true;
   if(!client.isSignedIn()){show('login');return;}
   const user=await client.restore();
   if(user)await syncFamilies();else show('login');
  }catch{unconfigured();}
 }
 function open(){
  $('account-panel').hidden=false;
  button.setAttribute('aria-expanded','true');
  if(!accountReady)unconfigured();
  else if(!client?.isSignedIn())show(requestedEmail?'verify':'login');
  else {displaySignedIn();show('signed');}
  $('account-panel').scrollIntoView({block:'start',behavior:'instant'});
  if(client?.isSignedIn())$('account-close').focus();
  else $('account-email').focus();
 }
 function close(){
  $('account-panel').hidden=true;
  button.setAttribute('aria-expanded','false');status('');
  button.focus();
 }
 button.addEventListener('click',()=>$('account-panel').hidden?open():close());
 $('account-close').addEventListener('click',close);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('account-panel').hidden)close();});
 $('account-request-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=$('account-email').value.trim(),submit=$('account-send-code');submit.disabled=true;
  try{await client.sendCode(email);requestedEmail=email;nextCodeRequestAt=Date.now()+60000;show('verify');status('Vi har sendt en engangskode til '+email+'.');}
  catch(error){status(error.message,true);}finally{submit.disabled=false;}
 });
 $('account-verify-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const submit=$('account-verify');submit.disabled=true;
  try{
   await client.verifyCode(requestedEmail,$('account-code').value);
   await syncFamilies();
   status('Du er logget inn.');
   if(invitation)await acceptInvitation();
  }catch(error){status(error.message,true);}finally{submit.disabled=false;}
 });
 $('account-resend-code').addEventListener('click',async()=>{
  if(!client||!requestedEmail){show('login');return;}
  const remain=Math.ceil((nextCodeRequestAt-Date.now())/1000);
  if(remain>0){status('Vent '+remain+' sekunder før du ber om en ny kode.',true);return;}
  const submit=$('account-resend-code');submit.disabled=true;
  try{
   await client.sendCode(requestedEmail);
   nextCodeRequestAt=Date.now()+60000;
   $('account-code').value='';
   status('En ny engangskode er forespurt til '+requestedEmail+'. Bruk bare den nyeste koden; tidligere koder kan være ugyldige.');
  }catch(error){status('Kunne ikke sende ny kode: '+error.message,true);}
  finally{submit.disabled=false;}
 });
 $('account-back-email').addEventListener('click',()=>{show('login');status('');});
 $('account-family-create').addEventListener('submit',async e=>{
  e.preventDefault();const submit=$('account-create');submit.disabled=true;
  try{
   const id=await client.createFamily($('account-family-name').value.trim());
   await syncFamilies(id);
   status('Familien er opprettet! Legg til barna fra familieoversikten.');
   familyUI.enter();
  }catch(error){status(error.message,true);}finally{submit.disabled=false;}
 });
 $('account-family-picker').addEventListener('change',async e=>{
  try{await syncFamilies(e.target.value);status('Byttet familie.');}
  catch(error){status(error.message,true);}
 });
 $('account-invite-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const submit=$('account-invite-submit');submit.disabled=true;
  try{
   const email=$('account-invite-email').value.trim();
   const token=await client.inviteParent(familyId,email);
   if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))
    throw Error('Kunne ikke lage invitasjonen.');
   const link=location.origin+location.pathname+'#invite='+token;
   $('account-invite-link').value=link;
   $('account-invite-result').hidden=false;
   status('Invitasjonen gjelder bare denne e-postadressen og utløper etter 48 timer. Send lenken på en trygg måte.');
  }catch(error){status(error.message,true);}finally{submit.disabled=false;}
 });
 $('account-copy-invite').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText($('account-invite-link').value);status('Invitasjonslenken er kopiert.');}
  catch{status('Kopier lenken manuelt fra feltet.',true);}
 });
 async function acceptInvitation(){
  if(!invitation)return;
  const token=invitation;invitation=null;
  $('account-invite-accept').hidden=true;
  try{
   const id=await client.acceptInvite(token);
   await syncFamilies(id);
   status('Du har nå tilgang til familien.');
   familyUI.enter();
  }catch(error){status('Invitasjonen kunne ikke godtas: '+error.message,true);}
 }
 $('account-invite-accept').addEventListener('click',acceptInvitation);
 $('account-import').addEventListener('click',async()=>{
  if(!familyId)return;
  const local=readFamily(read(FAMILY_STORAGE_KEY),siteConfig.schools);
  if(!local.length){status('Fant ingen lokale barneprofiler.');return;}
  if(!confirm('Importere '+local.length+' barneprofil(er) og avkrysninger for inneværende uke til familiekontoen? Gamle data blir værende på denne enheten.'))return;
  const button=$('account-import');button.disabled=true;
  try{
   const result=await importCurrentLocalFamily({client,familyId,schools:siteConfig.schools,
    calendar:schoolCalendar(new Date(),'Europe/Oslo'),storage:localStorage,
    fetchPlan:async(school,grade)=>{
     const response=await fetch('/api/plan?school='+encodeURIComponent(school)+'&grade='+encodeURIComponent(grade));
     if(!response.ok)throw Error('Ukeplanen kunne ikke hentes');
     return response.json();
    },onProgress:message=>status(message)});
   await syncFamilies(familyId);
   status('Importerte '+result.profiles+' nye profiler og '+result.marked+
    ' fullførte oppgaver fra denne uka.'+(result.notes.length?' '+result.notes.join(' '):''));
  }catch(error){status('Importen ble avbrutt: '+error.message+' Du kan prøve på nytt uten å miste lokale data.',true);}
  finally{button.disabled=false;}
 });
 $('account-delete-family').addEventListener('click',async()=>{
  const f=families.find(x=>x.id===familyId);if(!f)return;
  const typed=prompt('Dette sletter familien, barneprofiler og alle avkrysninger permanent. Skriv familienavnet "'+f.name+'" for å bekrefte.');
  if(typed!==f.name)return;
  try{await client.deleteFamily(familyId);familyId=null;await syncFamilies();status('Familien og tilhørende data er slettet.');}
  catch(error){status('Kunne ikke slette familien: '+error.message,true);}
 });
 $('account-leave-family').addEventListener('click',async()=>{
  if(!familyId||!confirm('Vil du forlate denne familien?'))return;
  try{await client.leaveFamily(familyId);familyId=null;await syncFamilies();status('Du har forlatt familien.');}
  catch(error){status('Kunne ikke forlate familien: '+error.message,true);}
 });
 $('account-signout').addEventListener('click',async()=>{
  try{await client.signOut();}
  catch{client.signOutLocal();}
  familyUI.clearCloud();familyId=null;families=[];requestedEmail='';show('login');
  button.textContent='Logg inn';status('Du er logget ut. Lokale data er fortsatt tilgjengelige.');
 });
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&client?.isSignedIn()&&familyUI.isActive())
   void familyUI.refreshCloud();
 });
 void restore().then(()=>{if(invitation&&client?.isSignedIn()){open();show('signed');
   status('Du har en invitasjon. Velg «Godta invitasjonen» for å fortsette.');}});
 return {restore,open,close};
}
