const $=id=>document.getElementById(id);
const status=$('status'),check=$('confirm'),start=$('start'),logout=$('logout');
let ready=false,authenticated=false;
const previewHost='deploy-preview-169--ukeplanen.netlify.app';
const messages={
  'signed-in':'Feide-innlogging er bekreftet. Prøv nå full utlogging.',
  'logged-out':'Feide sendte nettleseren tilbake med korrekt logout-state. Lokal økt er avsluttet.',
  'logout-unconfirmed':'Lokal økt er avsluttet, men Feide-returen kunne ikke verifiseres.',
  'already-logged-out':'Ingen aktiv lokal økt å logge ut.',
  'login-invalid':'Feide-innlogging mislyktes eller ble avvist.',
  'login-cancelled':'Feide-innlogging ble avbrutt.'
};
const update=()=>{start.disabled=!ready||authenticated||!check.checked;logout.disabled=!ready||!authenticated;};
const setMessage=t=>{status.textContent=t;};
function sanitizeURL() {
  const params=new URLSearchParams(location.search);
  const code=params.get('result');
  history.replaceState(null,'',location.pathname);
  return Object.hasOwn(messages,code)?code:null;
}
async function init(){
  const result=sanitizeURL();
  if(location.hostname!==previewHost||location.protocol!=='https:'){
    setMessage('Denne testen er ikke tilgjengelig utenfor Deploy Preview #169.');return;
  }
  try{
    const response=await fetch('/api/feide-oidc/status',{cache:'no-store',credentials:'same-origin'});
    if(!response.ok)throw Error('status');
    const data=await response.json();
    ready=data.ready===true; authenticated=data.authenticated===true;
    $('session-state').textContent=authenticated?'Aktiv, verifisert Feide-testøkt':'Ingen aktiv testøkt';
    $('feide-state').textContent=result==='logged-out'?'Retur verifisert':result==='logout-unconfirmed'?'Ikke verifisert':'Ikke testet';
    setMessage(result?messages[result]:ready?'Testmiljø klart. Bruk en Feide-testbruker.':
      'Manglende konfigurasjon: FEIDE_POC_CLIENT_ID, FEIDE_POC_CLIENT_SECRET, FEIDE_POC_COOKIE_KEY og FEIDE_POC_ENABLED må settes for Netlify Deploy Previews.');
  }catch{setMessage('Kunne ikke kontakte Feide-testserveren.');}
  update();
}
check.addEventListener('change',update);
start.addEventListener('click',()=>{if(ready&&!authenticated&&check.checked)location.assign('/api/feide-oidc/start');});
logout.addEventListener('click',()=>{if(ready&&authenticated)location.assign('/api/feide-oidc/logout');});
void init();
