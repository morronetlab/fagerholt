import {CALLBACK_PATH,PENDING_KEY,isPreviewHost,previewCallback,feideAuthorizeURL,
  parseOAuthCallback,identitySummary} from './poc-core.mjs';

const $=id=>document.getElementById(id);
const message=text=>{$('message').textContent=text;};
const login=$('login'),logout=$('logout'),confirmation=$('test-confirm');
let config=null;
let accessToken=null;
let ready=false;

function updateLogin() { login.disabled=!ready||!confirmation.checked||Boolean(accessToken); }
function clearCredentials() { accessToken=null; logout.disabled=true; updateLogin(); }
function scrubCallbackURL() {
  // OAuth fragments may contain bearer, refresh and provider tokens.
  // Never navigate, log, or render any part of them.
  window.history.replaceState(null,'',window.location.pathname);
}
async function getConfig() {
  const res=await fetch('/api/account-config',{cache:'no-store',referrerPolicy:'no-referrer'});
  if(!res.ok)throw Error('Kunne ikke hente offentlig Supabase-konfigurasjon.');
  const data=await res.json();
  if(!data?.enabled||!data.url||!data.publishableKey)throw Error('Supabase er ikke konfigurert på denne Deploy Preview.');
  feideAuthorizeURL(data.url,window.location.origin); // verifies trusted origins
  return data;
}
async function verifySupabaseSession(token) {
  const res=await fetch(config.url.replace(/\/$/u,'')+'/auth/v1/user',{
    method:'GET',cache:'no-store',referrerPolicy:'no-referrer',
    headers:{apikey:config.publishableKey,Authorization:'Bearer '+token,Accept:'application/json'}
  });
  if(!res.ok)throw Error('Supabase avviste testøkten.');
  const user=await res.json();
  const summary=identitySummary(user);
  if(!summary.feide)throw Error('Testøkten kunne ikke knyttes til Feide-leverandøren.');
  if(summary.otherIdentities)throw Error('Kontoen har andre innloggingsidentiteter. Avbryt: mulig automatisk kontokobling.');
  return summary;
}
async function signOutLocal() {
  const token=accessToken;
  if(!token){message('Ingen aktiv testøkt på denne siden.');return;}
  logout.disabled=true;
  message('Avslutter Supabase-testøkt …');
  try {
    const res=await fetch(config.url.replace(/\/$/u,'')+'/auth/v1/logout?scope=local',{
      method:'POST',cache:'no-store',referrerPolicy:'no-referrer',
      headers:{apikey:config.publishableKey,Authorization:'Bearer '+token}
    });
    if(!res.ok)throw Error('Serveren kunne ikke bekrefte at økten er avsluttet.');
    message('Supabase-testøkten er avsluttet. Feide-økten er IKKE avsluttet (SLO gjenstår).');
  } catch {
    message('Kunne ikke bekrefte serverutlogging. Testøkten er fjernet fra denne siden, men en utstedt JWT kan fortsatt være gyldig til utløp.');
  } finally {
    clearCredentials();
    $('identity-status').textContent='Test avsluttet';
    $('subject-status').textContent='Test avsluttet';
  }
}
async function callback() {
  const result=parseOAuthCallback(window.location.hash,window.location.search);
  scrubCallbackURL();
  const pending=sessionStorage.getItem(PENDING_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  if(!pending){message('Ingen testinnlogging ble startet i denne fanen. Avbryter.');return;}
  if(result.kind!=='access-token'){
    message(result.kind==='error'?'Feide-innlogging ble avbrutt eller feilet.':
      result.kind==='unsupported-code'?'Supabase returnerte en PKCE-kode. POC må oppdateres til en kodeutveksling før test.':
      'Supabase returnerte ingen brukbar testøkt.');
    return;
  }
  // The raw Feide ID-token is not documented as a Supabase session field.
  // Even if an ID-token-shaped field is returned, it is NOT trusted as
  // a Feide logout token until issuer, signature and audience are verified.
  $('logout-status').textContent=result.rawIdTokenReturned?
    'Et ID-token-felt ble returnert – opprinnelse ikke verifisert':
    'Ingen ID-token-felt fra Supabase – Feide SLO blokkert';
  accessToken=result.accessToken;
  try {
    const summary=await verifySupabaseSession(accessToken);
    $('identity-status').textContent='Bekreftet via Supabase';
    $('subject-status').textContent=summary.stableSubject?'OIDC sub tilgjengelig':'Ikke påvist i Supabase-identiteten';
    logout.disabled=false;
    message('Feide-testinnlogging lykkes. Ingen barnedata er åpnet. Avslutt Supabase-testøkten etter kontroll.');
  } catch {
    // An unexpected identity must not be kept active in this test.
    await signOutLocal();
    message('Testøkten kunne ikke godkjennes. Mulig feil leverandør eller automatisk kontokobling. Ikke bruk denne kontoen til videre testing.');
  }
}
async function initialize() {
  const isCallback=window.location.pathname===CALLBACK_PATH;
  if(!isPreviewHost(window.location.hostname)){
    scrubCallbackURL(); message('Feide-test er deaktivert utenfor Netlify Deploy Preview.');return;
  }
  try { config=await getConfig(); ready=true; updateLogin(); }
  catch {scrubCallbackURL();message('Denne previewen mangler nødvendig offentlig Supabase-konfigurasjon.');return;}
  if(isCallback)await callback();
  else {
    if(window.location.hash||window.location.search)scrubCallbackURL();
    message('Testmiljø klart. Bruk kun en separat Feide-testkonto.');
  }
}
confirmation.addEventListener('change',updateLogin);
login.addEventListener('click',()=>{
  if(!ready||!confirmation.checked||accessToken)return;
  try {
    const redirect=previewCallback(window.location.origin);
    const url=feideAuthorizeURL(config.url,window.location.origin);
    if(new URL(url).searchParams.get('redirect_to')!==redirect)throw Error('Feil callback.');
    sessionStorage.setItem(PENDING_KEY,'1');
    window.location.assign(url);
  }catch{message('Kunne ikke starte sikker testinnlogging.');}
});
logout.addEventListener('click',()=>void signOutLocal());
void initialize();
