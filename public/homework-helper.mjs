/** Interactive, no-login homework assistant. Never collects pupil identity. */
const $=id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let active=null,controller=null;
export function openHomeworkHelper({text,subject,grade}){
 if(!text)return;
 active={text:String(text).slice(0,700),subject:String(subject||'').slice(0,80),grade:String(grade||'').slice(0,3)};
 $('helper-task').textContent=active.text;
 $('helper-result').textContent='Jeg kan forklare hva oppgaven betyr eller gi deg et lite hint. Du gjør oppgaven selv.';
 $('helper-status').textContent='';
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
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)close();});
}
function close(){controller?.abort();controller=null;active=null;$('helper-modal').hidden=true;$('helper-status').textContent='';}
async function ask(mode){
 if(!active||!['explain','hint'].includes(mode))return;
 controller?.abort();
 const current=controller=new AbortController();
 const buttons=$('helper-modal').querySelectorAll('[data-helper-mode]');
 buttons.forEach(b=>b.disabled=true);
 $('helper-status').textContent='Lager hjelp til oppgaven …';
 $('helper-result').textContent='';
 try {
  const response=await fetch('/api/homework-helper',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...active,mode}),signal:current.signal});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Leksehjelperen er midlertidig utilgjengelig.');
  if(controller!==current)return;
  $('helper-result').textContent=String(data.help||'Ingen forklaring tilgjengelig.');
  $('helper-status').textContent='Svar fra AI · sjekk med en voksen hvis noe virker feil.';
 }catch(error){if(error.name!=='AbortError'){$('helper-result').textContent=error.message;$('helper-status').textContent='';}}
 finally{if(controller===current){buttons.forEach(b=>b.disabled=false);controller=null;}}
}
