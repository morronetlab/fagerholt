/** Interactive, no-login homework assistant. Never collects pupil identity. */
const $=id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let active=null,controller=null,returnFocus=null;
export function openHomeworkHelper({text,subject,grade}){
 if(!text)return;
 returnFocus=document.activeElement;
 active={text:String(text).slice(0,700),subject:String(subject||'').slice(0,80),grade:String(grade||'').slice(0,3)};
 $('helper-task').textContent=active.text;
 $('helper-result').textContent='Jeg kan forklare hva oppgaven betyr eller gi deg et lite hint. Du gjør oppgaven selv.';
 $('helper-status').textContent='';
 $('helper-modal').querySelectorAll('[data-helper-mode]').forEach(b=>{b.disabled=false;b.removeAttribute('aria-pressed');});
 $('helper-modal').hidden=false;
 $('helper-modal').querySelector('[data-helper-mode]')?.focus();
}
export function initHomeworkHelper(){
 const modal=$('helper-modal');
 modal.addEventListener('click',e=>{
  if(e.target===modal||e.target.closest('[data-helper-close]'))close();
  const button=e.target.closest('[data-helper-mode]');
  if(button)void ask(button.dataset.helperMode);
 });
 document.addEventListener('keydown',e=>{
  if(modal.hidden)return;
  if(e.key==='Escape'){e.preventDefault();close();return;}
  if(e.key!=='Tab')return;
  const focusable=[...modal.querySelectorAll('button:not([disabled])')];
  const first=focusable[0],last=focusable.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
 });
}
function close(){
 controller?.abort();controller=null;active=null;
 $('helper-modal').hidden=true;$('helper-status').textContent='';
 $('helper-modal').removeAttribute('aria-busy');
 if(returnFocus?.isConnected)returnFocus.focus();
 returnFocus=null;
}
async function ask(mode){
 if(!active||!['explain','hint'].includes(mode))return;
 controller?.abort();
 const current=controller=new AbortController();
 const buttons=$('helper-modal').querySelectorAll('[data-helper-mode]');
 buttons.forEach(b=>{b.disabled=true;b.setAttribute('aria-pressed',String(b.dataset.helperMode===mode));});
 $('helper-modal').setAttribute('aria-busy','true');
 $('helper-status').textContent='✨ Tenker ut en god forklaring …';
 $('helper-result').textContent='';
 try {
  const response=await fetch('/api/homework-helper',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...active,mode}),signal:current.signal});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Leksehjelperen er midlertidig utilgjengelig.');
  if(controller!==current)return;
  $('helper-result').textContent=String(data.help||'Ingen forklaring tilgjengelig.');
  $('helper-status').textContent='Svar fra AI · sjekk med en voksen hvis noe virker feil.';
 }catch(error){if(error.name!=='AbortError'&&controller===current){
  $('helper-result').textContent=error.message;
  $('helper-status').textContent='Noe gikk galt. Du kan prøve igjen.';
 }}
 finally{if(controller===current){buttons.forEach(b=>b.disabled=false);$('helper-modal').removeAttribute('aria-busy');controller=null;}}
}
