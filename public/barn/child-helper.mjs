/** Uses the same anonymous, source-task-only homework helper as the public plan.
 * Never transmits child identity or a device capability to the AI endpoint.
 */
const $=id=>document.getElementById(id);
let active=null,controller=null,focused=null;
function close(){
 controller?.abort();controller=null;active=null;
 if($('child-helper').open)$('child-helper').close();
 focused?.focus?.({preventScroll:true});focused=null;
}
export function initChildHelper(){
 $('child-helper-close').addEventListener('click',close);
 $('child-helper').addEventListener('click',event=>{
  if(event.target===$('child-helper'))close();
 });
 $('child-helper').addEventListener('close',()=>{controller?.abort();controller=null;active=null;});
 $('child-helper').addEventListener('click',async event=>{
  const button=event.target.closest('[data-child-help]');if(!button||!active)return;
  const mode=button.dataset.childHelp;
  if(!['hint','explain'].includes(mode))return;
  controller?.abort();const ctrl=controller=new AbortController();
  $('child-helper-status').textContent='✨ Finner en god forklaring …';
  $('child-helper-result').textContent='';
  $('child-helper').querySelectorAll('[data-child-help]').forEach(x=>x.disabled=true);
  try{
   const res=await fetch('/api/homework-helper',{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({...active,mode}),
    signal:ctrl.signal,cache:'no-store'});
   const data=await res.json();
   if(!res.ok)throw Error(data.error||'Leksehjelpen er utilgjengelig.');
   if(controller!==ctrl)return;
   $('child-helper-result').textContent=String(data.help||'Ingen forklaring tilgjengelig.');
   $('child-helper-status').textContent='Svar fra AI – sjekk med en voksen hvis noe er uklart.';
  }catch(error){if(controller===ctrl&&error.name!=='AbortError'){
    $('child-helper-status').textContent='Leksehjelperen kunne ikke svare.';
    $('child-helper-result').textContent=error.message;
  }}finally{if(controller===ctrl){
   $('child-helper').querySelectorAll('[data-child-help]').forEach(x=>x.disabled=false);
   controller=null;
  }}
 });
}
export function openChildHelper(item,grade){
 if(!item?.text)return;
 focused=document.activeElement;
 active={text:String(item.text).slice(0,700),
  subject:String(item.subject||'').slice(0,80),
  grade:String(grade||'').slice(0,3)};
 $('child-helper-task').textContent=active.text;
 $('child-helper-result').textContent='Velg om du vil ha en forklaring eller et hint.';
 $('child-helper-status').textContent='';
 $('child-helper').showModal();
 $('child-helper').querySelector('[data-child-help]')?.focus();
}
