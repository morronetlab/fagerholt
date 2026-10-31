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
export function initAccountUI({familyUI,onGoFamily=()=>familyUI.enter()}){
 let client=null,accountReady=false,requestedEmail='',familyId=null,families=[],children=[],invitation=invitationsFromUrl(),nextCodeRequestAt=0;
 let currentScreen='login',gradeRun=0,restoring=true,digestRequest=0;
 const status=(msg,error=false)=>{$('account-message').textContent=msg||'';$('account-message').dataset.error=String(error);};
 const show=id=>{
  currentScreen=id;
  for(const section of $('account-panel').querySelectorAll('[data-account-screen]'))
   section.hidden=section.dataset.accountScreen!==id;
  const step=id==='login'||id==='verify'?1:id==='signed'&&!familyId?2:id==='children'?3:id==='completed'?4:0;
  $('account-steps').hidden=!step;
  for(const el of $('account-steps').querySelectorAll('[data-onboard-step]')){
   el.classList.toggle('current',Number(el.dataset.onboardStep)===step);
   el.classList.toggle('done',Number(el.dataset.onboardStep)<step);
  }
  $('account-heading').textContent=id==='login'?'Kom i gang med Skoleuka':
   id==='verify'?'Bekreft e-postadressen':id==='children'?'Legg til barna':
   id==='completed'?'Familien er klar!':id==='signed'&&!familyId?'Opprett familien din':
   id==='signed'?'Familieinnstillinger':'Familien på alle enheter';
 };
 const button=$('account-button');
 const unconfigured=()=>{
  show('missing');button.textContent='Konto';accountReady=false;
 };
 function displaySignedIn(){
  button.textContent='Min konto';
  $('account-user-email').textContent=client.session?.user?.email||requestedEmail||'Innlogget forelder';
  $('account-current-family').textContent=familyId&&families.find(f=>f.id===familyId)?.name||'Ingen familie valgt';
 }
 async function refreshDigestSettings(){
  const seq=++digestRequest;
  const section=$('account-digest-settings'),checkbox=$('account-digest-optin');
  section.hidden=!client?.isSignedIn()||!familyId;
  checkbox.disabled=true;
  $('account-digest-send-test').disabled=true;
  if(section.hidden)return;
  try{
   const [config,enabled]=await Promise.all([
    fetch('/api/digest-config',{cache:'no-store'})
     .then(async r=>r.ok?r.json():{available:false}).catch(()=>({available:false})),
    client.weeklyDigestPreference()
   ]);
   if(seq!==digestRequest)return;
   checkbox.checked=enabled;
   checkbox.disabled=!config.available;
   $('account-digest-send-test').disabled=!config.available||!enabled;
   $('account-digest-availability').textContent=config.available?
    'Utsendingen er aktiv. Oppsummeringen sendes søndag kveld når neste ukes kilder er tilgjengelige.':
    'E-postutsending er foreløpig ikke aktivert av driftsansvarlig. Påmelding er sperret.';
  }catch{
   if(seq!==digestRequest)return;
   checkbox.checked=false;checkbox.disabled=true;
   $('account-digest-availability').textContent='Kan ikke lese e-postinnstillingene. Kontakt driftsansvarlig.';
  }
 }
 $('account-digest-optin').addEventListener('change',async e=>{
  if(!client?.isSignedIn()||!familyId)return;
  const checkbox=e.target,desired=checkbox.checked;
  checkbox.disabled=true;
  $('account-digest-status').textContent='Lagrer innstillingen …';
  try{
   await client.setWeeklyDigest(desired);
   $('account-digest-status').textContent=desired?
    'Du er påmeldt søndagsoppsummeringen.':'E-postoppsummeringen er slått av.';
  }catch(error){
   checkbox.checked=!desired;
   $('account-digest-status').textContent='Kunne ikke lagre valget: '+error.message;
  }finally{void refreshDigestSettings();}
 });
 $('account-digest-send-test').addEventListener('click',async()=>{
  const button=$('account-digest-send-test');
  if(!client?.isSignedIn()||!familyId||!$('account-digest-optin').checked)return;
  button.disabled=true;
  $('account-digest-status').textContent='Sender testmail til den bekreftede e-postadressen din …';
  try{
   await client.ensureSession();
   const res=await fetch('/api/digest-send-test',{method:'POST',cache:'no-store',headers:{
    Authorization:'Bearer '+client.session.access_token,Accept:'application/json'
   }});
   const data=await res.json().catch(()=>null);
   if(!res.ok)throw Error(data?.error||'Testutsending mislyktes.');
   $('account-digest-status').textContent='E-postleverandøren har godtatt testmailen. Sjekk innboksen og søppelpost.';
  }catch(error){
   $('account-digest-status').textContent='Kunne ikke sende testmail: '+String(error.message).slice(0,170);
  }finally{void refreshDigestSettings();}
 });
 async function syncFamilies(preferred=null,{screen='signed'}={}){
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
   children=await client.children(familyId);
   await familyUI.setCloud(client,familyId,children);
   const local=readFamily(read(FAMILY_STORAGE_KEY),siteConfig.schools);
   $('account-import').hidden=!local.length;
   familyUI.enter();
  }else{children=[];familyUI.clearCloud();}
  $('onboard-children-list').replaceChildren();
  for(const child of children){
   const item=document.createElement('div');
   item.className='onboard-child-item';
   const title=document.createElement('strong');title.textContent=child.nickname;
   const info=document.createElement('small');
   info.textContent=(siteConfig.schools[child.school_id]?.name||'Skole')+' · '+child.grade+'. trinn'+
    (child.group_name?' · '+child.group_name:'');
   item.append(title,info);$('onboard-children-list').append(item);
  }
  $('onboard-child-save').disabled=children.length>=6;
  $('onboard-child-save').textContent=children.length>=6?'Maks seks barn':'+ Legg til barn';
  const local=readFamily(read(FAMILY_STORAGE_KEY),siteConfig.schools);
  $('onboard-import-row').hidden=!local.length||!familyId;
  $('onboard-children-next').textContent=children.length?'Fortsett →':'Gå til familieoversikten →';
  $('onboard-complete-description').textContent=children.length?
   children.length+' barn er lagt til. Nå kan dere følge skoleuka fra samme familiekonto.':
   'Familien er opprettet. Legg til barn fra familieoversikten når du ønsker.';
  displaySignedIn();
  show(familyId?screen:'signed');
  void refreshDigestSettings();
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
  finally{restoring=false;}
 }
 const panel=$('account-panel');
 let returnFocus=null,returnScrollY=0,returnToPage=true;
 let originalLockTop='';
 function open(){
  if(panel.open)return;
  returnFocus=document.activeElement;
  returnScrollY=window.scrollY;
  returnToPage=true;
  originalLockTop=document.body.style.getPropertyValue('--account-lock-top');
  if(restoring){show('loading');}
  else if(!accountReady)unconfigured();
  else if(!client?.isSignedIn())show(requestedEmail?'verify':'login');
  else if(currentScreen==='children'||currentScreen==='completed')show(currentScreen);
  else{displaySignedIn();show('signed');}
  // Native modal makes the rest of the app inert and traps keyboard focus.
  panel.showModal();
  document.body.style.setProperty('--account-lock-top','-'+returnScrollY+'px');
  document.documentElement.classList.add('account-modal-open');
  document.body.classList.add('account-modal-open');
  button.setAttribute('aria-expanded','true');
  panel.scrollTop=0;
  const focusTarget=!accountReady||client?.isSignedIn()?'account-close':
   requestedEmail?'account-code':'account-email';
  $(focusTarget).focus({preventScroll:true});
 }
 function close({restorePage=true}={}){
  if(!panel.open)return;
  returnToPage=restorePage;
  button.setAttribute('aria-expanded','false');
  panel.close();
 }
 // ESC is handled by the browser and triggers the same cleanup as the X.
 panel.addEventListener('close',()=>{
  document.documentElement.classList.remove('account-modal-open');
  document.body.classList.remove('account-modal-open');
  if(originalLockTop)document.body.style.setProperty('--account-lock-top',originalLockTop);
  else document.body.style.removeProperty('--account-lock-top');
  button.setAttribute('aria-expanded','false');status('');
  if(returnToPage){
   window.scrollTo({top:returnScrollY,left:0,behavior:'instant'});
   const target=returnFocus?.isConnected?returnFocus:button;
   target.focus({preventScroll:true});
  }
  returnToPage=true;
 });
 button.addEventListener('click',()=>panel.open?close():open());
 $('account-close').addEventListener('click',()=>close());
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
   if(invitation)status('Du er logget inn. Du har mottatt en familieinvitasjon. Velg «Godta mottatt familieinvitasjon» for å fortsette.');
   else if(familyId&&!children.length){show('children');status('Du er logget inn. Legg til barnet ditt.');}
   else status('Du er logget inn.');
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
   await syncFamilies(id,{screen:'children'});
   status('Familien er opprettet. Legg til barna, eller fortsett uten barn.');
   $('onboard-child-name').focus();
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
  const token=invitation;
  const action=$('account-invite-accept');action.disabled=true;
  try{
   const id=await client.acceptInvite(token);
   invitation=null;
   await syncFamilies(id);
   status('Du har nå tilgang til familien.');
   familyUI.enter();
  }catch(error){status('Invitasjonen kunne ikke godtas: '+error.message,true);}
  finally{action.disabled=false;}
 }
 $('account-invite-accept').addEventListener('click',acceptInvitation);
 async function importLocal(button){
  if(!familyId)return;
  const local=readFamily(read(FAMILY_STORAGE_KEY),siteConfig.schools);
  if(!local.length){status('Fant ingen lokale barneprofiler.');return;}
  if(!confirm('Importere '+local.length+' barneprofil(er) og avkrysninger for inneværende uke til familiekontoen? Gamle data blir værende på denne enheten.'))return;
  button.disabled=true;
  try{
   const result=await importCurrentLocalFamily({client,familyId,schools:siteConfig.schools,
    calendar:schoolCalendar(new Date(),'Europe/Oslo'),storage:localStorage,
    fetchPlan:async(school,grade)=>{
     const response=await fetch('/api/plan?school='+encodeURIComponent(school)+'&grade='+encodeURIComponent(grade));
     if(!response.ok)throw Error('Ukeplanen kunne ikke hentes');
     return response.json();
    },onProgress:message=>status(message)});
   await syncFamilies(familyId,{screen:currentScreen==='children'?'children':'signed'});
   status('Importerte '+result.profiles+' nye profiler og '+result.marked+
    ' fullførte oppgaver fra denne uka.'+(result.notes.length?' '+result.notes.join(' '):''));
  }catch(error){status('Importen ble avbrutt: '+error.message+' Du kan prøve på nytt uten å miste lokale data.',true);}
  finally{button.disabled=false;}
 }
 $('account-import').addEventListener('click',()=>void importLocal($('account-import')));
 $('onboard-import').addEventListener('click',()=>void importLocal($('onboard-import')));
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
  digestRequest++;$('account-digest-settings').hidden=true;
  familyUI.clearCloud();familyId=null;families=[];children=[];requestedEmail='';show('login');
  button.textContent='Logg inn';status('Du er logget ut. Lokale data er fortsatt tilgjengelige.');
 });
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&client?.isSignedIn()&&familyUI.isActive())
   void familyUI.refreshCloud();
 });
 const schoolOptions=Object.values(siteConfig.schools).sort((a,b)=>a.name.localeCompare(b.name,'nb-NO'));
 for(const school of schoolOptions)$('onboard-child-school').add(new Option(school.name,school.id));
 async function loadOnboardGrades(){
  const run=++gradeRun,school=$('onboard-child-school').value,select=$('onboard-child-grade');
  select.disabled=true;select.replaceChildren(new Option(school?'Henter klassetrinn …':'Velg skole først',''));
  if(!school)return;
  try{
   const res=await fetch('/api/grades?school='+encodeURIComponent(school));
   if(!res.ok)throw Error('Kunne ikke hente klassetrinn.');
   const data=await res.json();
   if(run!==gradeRun)return;
   select.replaceChildren(new Option('Velg klassetrinn',''));
   for(const grade of data.grades||[]){
    if(/^[1-7](?:[A-F])?$/i.test(grade.code||''))select.add(new Option(grade.code+'. klasse',grade.code));
   }
   select.disabled=select.options.length===1;
   if(select.disabled)status('Ingen klassetrinn funnet. Prøv en annen skole.',true);
  }catch(error){if(run===gradeRun){select.replaceChildren(new Option('Kunne ikke hente trinn',''));status(error.message,true);}}
 }
 $('onboard-child-school').addEventListener('change',()=>{status('');void loadOnboardGrades();});
 $('onboard-child-form').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!client?.isSignedIn()||!familyId)return;
  if(children.length>=6){status('Maks seks barneprofiler per familie.',true);return;}
  const name=$('onboard-child-name').value.trim(),school=$('onboard-child-school').value,
   grade=$('onboard-child-grade').value,group=$('onboard-child-group').value.trim();
  if(!name||name.length>40||!Object.hasOwn(siteConfig.schools,school)||
     !/^[1-7](?:[A-F])?$/i.test(grade)||group.length>35){status('Kontroller navn, skole, klassetrinn og gruppe.',true);return;}
  const submit=$('onboard-child-save');submit.disabled=true;
  try{
   const created=await client.createChild({family_id:familyId,nickname:name,school_id:school,
    grade,group_name:group});
   if(!created?.[0]?.id)throw Error('Serveren bekreftet ikke barneprofilen.');
   await syncFamilies(familyId,{screen:'children'});
   $('onboard-child-name').value='';$('onboard-child-group').value='';
   status('Barnet er lagt til. Du kan legge til flere, eller fortsette.');
   $('onboard-child-name').focus();
  }catch(error){status('Kunne ikke legge til barnet: '+error.message,true);}
  finally{submit.disabled=children.length>=6;}
 });
 $('onboard-children-back').addEventListener('click',()=>show('signed'));
 $('onboard-children-next').addEventListener('click',()=>{show('completed');status('');});
 $('onboard-dashboard').addEventListener('click',()=>{close({restorePage:false});onGoFamily();$('family-title').focus({preventScroll:true});});
 $('onboard-open-invite').addEventListener('click',()=>{show('signed');$('account-invite-email').focus();});
 $('account-open-family').addEventListener('click',()=>{close({restorePage:false});onGoFamily();});
 void restore().then(()=>{if(invitation&&client?.isSignedIn()){open();show('signed');
   status('Du har en invitasjon. Velg «Godta mottatt familieinvitasjon» for å fortsette.');}});
 return {restore,open,close};
}
