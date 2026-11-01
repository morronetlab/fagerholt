/** This admin-only page does not persist tokens, expose them in URLs or log data. */
const $=id=>document.getElementById(id);
const words={
 ready:'Ukeplan klar',ai_ready:'AI ferdig',pdf_found:'PDF-lenke funnet',
 unpublished:'Ingen PDF funnet',grade_missing:'Trinnside mangler',
 source_error:'Feil på skolekilde',pdf_download_failed:'PDF-hentefeil',
 pdf_parse_failed:'PDF-tolkningsfeil',unreadable:'PDF uten tekst',
 ai_processing:'AI analyserer',ai_failed:'AI-analyse feilet',
 partial:'Delvis tolket'
};
let secret='',summary=null;
const time=x=>x?new Intl.DateTimeFormat('nb-NO',{dateStyle:'medium',timeStyle:'short'}).format(new Date(x)):'–';
const text=(id,value)=>{$(id).textContent=value;};
function cell(row,value){
 const td=document.createElement('td');td.textContent=String(value??'–');row.append(td);
}
function indicator(kind){
 const chip=document.createElement('span');chip.className='chip '+kind;
 chip.textContent=kind==='attention'?'Feil':kind==='not_monitored'?'Ikke kontrollert':
  kind==='processing'?'Pågår':kind==='stale'?'Utdatert':'Kontrollert';
 return chip;
}
function render(){
 if(!summary)return;
 text('last-update','Sist hentet: '+time(summary.checkedAt));
 text('schools-count',summary.totalSchools);
 text('grades-count',summary.observedGrades);
 text('attention-count',summary.attentionGrades);
 text('calendar-status','Status: '+(summary.calendar?.status||'ikke kontrollert')+
  (summary.calendar?.stale?' (foreldet)':''));
 text('calendar-verified','Sist verifisert: '+time(summary.calendar?.lastVerifiedAt));
 text('alert-info',summary.alertConfigured?
  'E-postvarsling er aktiv ved '+summary.alertsAfterConsecutiveFailures+' påfølgende feilkilder.':
  'E-postvarsling er ikke konfigurert. Sett SOURCE_ALERT_ENABLED=true, SOURCE_ALERT_EMAIL og verifisert e-postleverandør i Netlify.');
 const query=$('school-search').value.trim().toLocaleLowerCase('nb-NO');
 const target=$('school-list');target.replaceChildren();
 const schools=summary.schools.filter(s=>(s.name+' '+s.id).toLocaleLowerCase('nb-NO').includes(query))
  .sort((a,b)=>Number(b.status==='attention')-Number(a.status==='attention')||
   a.name.localeCompare(b.name,'nb-NO'));
 for(const school of schools){
  const details=document.createElement('details');details.className='school';
  const label=document.createElement('summary');
  label.append(document.createTextNode(school.name+' '));
  label.append(indicator(school.status));
  const info=document.createElement('small');
  info.textContent=school.grades.length+' kontrollerte trinn';label.append(info);details.append(label);
  if(!school.grades.length){
   const p=document.createElement('p');p.className='hint';
   p.textContent='Ingen observasjoner ennå. Legg til skolen i OPS_MONITOR_TARGETS, eller avvent bruk av ukeplanen.';
   details.append(p);
  }else{
   const scroll=document.createElement('div');scroll.className='scroll';
   const table=document.createElement('table');
   const head=document.createElement('thead'),tr=document.createElement('tr');
   for(const heading of ['Trinn','Status','Sist kontrollert','Siste vellykkede kilde','Siste PDF-funn','Sist komplett','Siste AI-ferdig','Feil på rad']){
    const th=document.createElement('th');th.textContent=heading;tr.append(th);
   }
   head.append(tr);table.append(head);
   const body=document.createElement('tbody');
   for(const grade of school.grades){
    const row=document.createElement('tr');
    for(const value of [grade.grade,(grade.stale?'Utdatert: ':'')+(words[grade.status]||grade.status),time(grade.lastCheckedAt),
     time(grade.lastSourceOkAt),time(grade.lastPdfFoundAt),time(grade.lastPlanReadyAt),time(grade.lastAIReadyAt),
     grade.consecutiveFailures||'0'])cell(row,value);
    body.append(row);
   }
   table.append(body);scroll.append(table);details.append(scroll);
  }
  target.append(details);
 }
 if(!schools.length){const p=document.createElement('p');p.textContent='Ingen skoler matcher søket.';target.append(p);}
}
async function load(){
 const response=await fetch('/api/operations-health',{method:'GET',
  headers:{Authorization:'Bearer '+secret},cache:'no-store',credentials:'omit',
  referrerPolicy:'no-referrer'});
 if(response.status===401)throw Error('Feil eller manglende tilgangsnøkkel.');
 if(!response.ok)throw Error('Kunne ikke hente driftsstatus ('+response.status+').');
 summary=await response.json();render();
}
$('credentials').addEventListener('submit',async event=>{
 event.preventDefault();secret=$('ops-token').value;$('ops-token').value='';
 try{await load();$('login').hidden=true;$('dashboard').hidden=false;text('auth-error','');}
 catch(error){secret='';text('auth-error',error.message);}
});
$('refresh').addEventListener('click',async()=>{
 try{await load();}catch(error){text('last-update',error.message);}
});
$('school-search').addEventListener('input',render);
$('logout').addEventListener('click',()=>{
 secret='';summary=null;$('dashboard').hidden=true;$('login').hidden=false;
 $('school-list').replaceChildren();$('ops-token').focus();
});
