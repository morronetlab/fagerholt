const $=id=>document.getElementById(id);
const preview='deploy-preview-170--ukeplanen.netlify.app';
const key='skoleuka.feide.link170.invite.v1';
let authenticated=false,ready=false,claimed=false;
const message=text=>{$('status').textContent=text};
function repaint(){
 $('login').disabled=!ready||authenticated;
 $('claim').disabled=!ready||!authenticated||claimed||!sessionStorage.getItem(key);
 $('logout').disabled=!ready||!authenticated;
}
async function init(){
 const url=new URL(location.href);
 const token=url.searchParams.get('token');
 history.replaceState(null,'',url.pathname);
 if(location.hostname!==preview||location.protocol!=='https:'){
  message('Feide-kobling er bare tilgjengelig i testmiljøet.');return;
 }
 if(token&&/^[a-f0-9]{64}$/.test(token))sessionStorage.setItem(key,token);
 try{
  const r=await fetch('/api/feide-oidc/status',{cache:'no-store',credentials:'same-origin'});
  if(!r.ok)throw Error('Kunne ikke kontakte Feide-innloggingen.');
  const data=await r.json();
  ready=data.ready===true;authenticated=data.authenticated===true;
  message(!ready?'Testmiljøet er ikke konfigurert.':!sessionStorage.getItem(key)?
    'Mangler invitasjonslenke fra foresatt.':'Invitasjon mottatt. Logg inn med Feide før koblingen bekreftes.');
  if(authenticated&&ready&&sessionStorage.getItem(key))message('Feide-innlogging er klar. Trykk «Koble til invitasjonen».');
 }catch{message('Feide-testserveren er ikke tilgjengelig.');}
 repaint();
}
$('login').addEventListener('click',()=>{
 if(ready&&!authenticated&&sessionStorage.getItem(key))
  location.assign('/api/feide-oidc/start?return=link');
});
$('claim').addEventListener('click',async()=>{
 const token=sessionStorage.getItem(key);
 if(!ready||!authenticated||claimed||!token)return;
 $('claim').disabled=true;message('Kobler Feide-testidentiteten til invitasjonen …');
 try{
  const res=await fetch('/api/feide-child-link?action=claim',{
   method:'POST',credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',
   headers:{'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({token})
  });
  const data=await res.json();
  if(!res.ok)throw Error(data?.error||'Kunne ikke bekrefte invitasjonen.');
  if(!/^[0-9]{6}$/.test(data.confirmationCode||''))throw Error('Ugyldig bekreftelseskode.');
  sessionStorage.removeItem(key);claimed=true;
  $('pin').textContent=data.confirmationCode;$('confirmation').hidden=false;
  message('Feide-identiteten er verifisert. Vis bekreftelseskoden til foresatt.');
 }catch(err){message(err.message);repaint();}
});
$('logout').addEventListener('click',()=>{if(authenticated)location.assign('/api/feide-oidc/logout');});
void init();
