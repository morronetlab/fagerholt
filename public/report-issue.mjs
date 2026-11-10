/** Accessible client-only issue dialog. Never sends child names, accounts or progress. */
import {siteConfig} from './site-config.mjs';

const el=id=>document.getElementById(id);
const KINDS=['wrong_date','missing_notice','wrong_interpretation',
 'duplicate_homework','not_homework','missing_homework'];
const validContext=x=>x&&typeof x.school==='string'&&typeof x.grade==='string'&&
 Number.isInteger(x.year)&&Number.isInteger(x.week);
const contextName=x=>(siteConfig.schools[x.school]?.name||'Skole')+
 ' · '+x.grade+'. trinn · uke '+x.week;
export function initIssueReporter(){
 const dialog=el('issue-report-dialog'),form=el('issue-report-form');
 const contextSelect=el('issue-report-context'),kindSelect=el('issue-report-kind');
 const description=el('issue-report-details'),source=el('issue-report-source');
 const status=el('issue-report-status'),submit=el('issue-report-submit');
 const itemField=el('issue-report-item-field'),itemSelect=el('issue-report-item');
 let contexts=[],fromItem=null,homework=null,sending=false,section=null,availableItems=[];
 function changeKind(){
  const missing=['missing_notice','missing_homework'].includes(kindSelect.value);
  description.required=missing;
  el('issue-report-help').textContent=missing?
   'Beskriv kort hva som mangler i den offentlige ukeplanen (minst 12 tegn).':
   'Beskriv gjerne hva som er feil eller hva original-PDF-en sier.';
 }
 function currentContext(){
  const index=Number(contextSelect.value);
  return Number.isInteger(index)&&index>=0&&index<contexts.length?contexts[index]:null;
 }
 function sourceText(){
  const ctx=currentContext();
  return fromItem&&ctx===fromItem.context?fromItem.text:'';
 }
 function selectItem(){
  const ctx=currentContext();
  const chosen=itemSelect.value===''?null:availableItems[Number(itemSelect.value)];
  if(availableItems.length){
   fromItem=chosen&&ctx===availableItems.context?
    {context:ctx,text:chosen.text,page:chosen.page}:null;
   homework=chosen?.homework&&fromItem?
    {context:ctx,...chosen.homework}:null;
  }
  kindSelect.querySelectorAll('[data-homework-kind]').forEach(option=>{
   const enabled=Boolean(homework)||(option.value==='missing_homework'&&section==='homework');
   option.disabled=!enabled;option.hidden=!enabled;
  });
  if(!homework&&['duplicate_homework','not_homework'].includes(kindSelect.value))
   kindSelect.value='wrong_interpretation';
  el('issue-report-title').textContent=homework?'Rapporter feil i leksen':
   section?'Rapporter feil i '+({homework:'lekser',bag:'pakkeliste',program:'dagsprogram',
    notices:'skolebeskjeder',vocabulary:'gloser','vocabulary-nb':'øveord'}[section]||'ukeplanen'):
   'Rapporter feil i ukeplanen';
  changeKind();refreshSource();
 }
 function refreshSource(){
  const text=sourceText();
  source.hidden=!text;
  source.textContent=text?(homework?'Leksens tekst: ':'Beskjeden du rapporterer: ')+text:'';
 }
 function open({contexts:sourceContexts=[],selected=0,kind='wrong_interpretation',
  sourceItem='',sourcePage=null,homework:homeworkContext=null,
  section:sourceSection=null,items:sourceItems=[]}={}){
  const inputs=sourceContexts.filter(validContext);
  if(!inputs.length)return false;
  contexts=inputs.map(x=>({school:x.school,grade:x.grade,year:x.year,
   week:x.week,pdf:typeof x.pdf==='string'?x.pdf:null}));
  contextSelect.replaceChildren();
  contexts.forEach((ctx,i)=>{
   const option=document.createElement('option');
   option.value=String(i);option.textContent=contextName(ctx);
   contextSelect.append(option);
  });
  contextSelect.value=String(Math.min(Math.max(Number(selected)||0,0),contexts.length-1));
  const fromContext=currentContext();
  section=typeof sourceSection==='string'?sourceSection:null;
  const text=String(sourceItem||'').slice(0,450);
  availableItems=Array.isArray(sourceItems)?sourceItems.slice(0,200).map(item=>({
   text:String(item?.text||'').slice(0,450),
   page:Number.isInteger(Number(item?.sourcePage))&&Number(item.sourcePage)>=1&&
    Number(item.sourcePage)<=100&&fromContext?.pdf?Number(item.sourcePage):null,
   homework:item?.homework&&Number.isInteger(item.homework.index)?
    {index:item.homework.index,subject:String(item.homework.subject||'').slice(0,65),
     dueDay:item.homework.dueDay||'',repeatDay:item.homework.repeatDay||''}:null
  })).filter(item=>item.text):[];
  availableItems.context=fromContext;
  itemSelect.replaceChildren();
  const none=document.createElement('option');
  none.value='';none.textContent='Hele seksjonen / annet';itemSelect.append(none);
  availableItems.forEach((item,index)=>{
   const option=document.createElement('option');
   option.value=String(index);
   option.textContent=item.text.length>90?item.text.slice(0,87)+'…':item.text;
   itemSelect.append(option);
  });
  itemSelect.value='';
  itemField.hidden=!availableItems.length;
  fromItem=text?{context:fromContext,text,page:sourcePage}:null;
  homework=homeworkContext&&text&&Number.isInteger(homeworkContext.index)&&
   homeworkContext.index>=0&&homeworkContext.index<=500?
   {context:fromContext,index:homeworkContext.index,
    subject:String(homeworkContext.subject||'').slice(0,65),
    dueDay:String(homeworkContext.dueDay||'').slice(0,20),
    repeatDay:String(homeworkContext.repeatDay||'').slice(0,20)}:null;
  if(availableItems.length){fromItem=null;homework=null;}
  selectItem();
  kindSelect.value=KINDS.includes(kind)?kind:'wrong_interpretation';
  if(!homework&&['duplicate_homework','not_homework'].includes(kindSelect.value))
   kindSelect.value='wrong_interpretation';
  description.value='';status.textContent='';status.hidden=true;submit.disabled=false;submit.hidden=false;
  form.hidden=false;sending=false;
  changeKind();refreshSource();
  dialog.showModal();
  kindSelect.focus();
  return true;
 }
 contextSelect.addEventListener('change',()=>{if(availableItems.length)itemSelect.value='';selectItem();});
 itemSelect.addEventListener('change',selectItem);
 kindSelect.addEventListener('change',changeKind);
 el('issue-report-close').addEventListener('click',()=>{if(!sending)dialog.close();});
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(sending)return;
  const ctx=currentContext(),kind=kindSelect.value,details=description.value.trim();
  if(!ctx||!KINDS.includes(kind)||['missing_notice','missing_homework'].includes(kind)&&details.length<12){
   status.textContent='Velg feiltype og beskriv hva som mangler (minst 12 tegn).';
   status.hidden=false;return;
  }
  const selectedHomework=homework&&ctx===homework.context?homework:null;
  const report={
   kind,school:ctx.school,grade:ctx.grade,year:ctx.year,week:ctx.week,
   pdf:ctx.pdf||null,sourcePage:sourceText()?fromItem.page:null,
   sourceText:sourceText(),details,
   ...(section?{section}:{}),
   ...(selectedHomework?{target:'homework',taskIndex:selectedHomework.index,
    taskSubject:selectedHomework.subject,dueDay:selectedHomework.dueDay,
    repeatDay:selectedHomework.repeatDay}:{})
  };
  sending=true;submit.disabled=true;status.hidden=false;status.textContent='Sender rapport …';
  try{
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),15000);
   let response;
   try{response=await fetch('/api/report-issue',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report),
    credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal
   });}finally{clearTimeout(timer);}
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.error||'Kunne ikke sende rapporten.');
   status.textContent=result.duplicate?'Denne rapporten er allerede registrert.':
    'Takk! Rapporten er registrert for '+contextName(ctx)+'.';
   submit.hidden=true;
  }catch(error){
   status.textContent=error.name==='AbortError'?
    'Det tok for lang tid å sende rapporten. Prøv igjen.':
    String(error.message||'Kunne ikke sende rapporten.');
   submit.disabled=false;
  }finally{sending=false;}
 });
 return {open};
}
