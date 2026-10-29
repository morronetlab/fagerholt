/** Read-only diagnostic for source-backed live deadlines. No state mutation. */
async function inspect(base,label){
 const fetchJson=async path=>{
   const url=base+path+(path.includes('?')?'&':'?')+'_diagnostic='+Date.now();
   const res=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(70000)});
   if(!res.ok)throw Error('HTTP '+res.status+' '+url);
   return res.json();
 };
 try{
  const build=await fetchJson('/build-info.json');
  let data=await fetchJson('/api/plan?school=todda&grade=6');
  const history=[data.aiStatus||'unknown'];
  if(data.jobId&&data.aiStatus==='processing'){
   for(let n=0;n<8;n++){
    await new Promise(resolve=>setTimeout(resolve,6500));
    const status=await fetchJson('/api/ai-status?job='+encodeURIComponent(data.jobId));
    history.push(status.aiStatus||'unknown');
    if(status.aiStatus==='ready'){data=status;break;}
    if(status.aiStatus==='failed')break;
   }
  }
  console.log('TODDA_LIVE_REPORT '+label+' '+JSON.stringify({
    build:build.commit,school:data.schoolId,grade:data.grade,week:data.week,year:data.year,
    status:data.status,parser:data.parser,aiStatus:data.aiStatus,statusHistory:history,
    warning:data.warning,pdf:data.pdf,homework:(data.homework||[]).map(x=>({
      subject:x.subject,dueDay:x.dueDay,repeatDays:x.repeatDays,text:x.text})),
   },null,2));
 }catch(e){console.log('TODDA_LIVE_ERROR '+label+' '+String(e));}
}
await inspect('https://ukeplanen.netlify.app','production');
await inspect('https://deploy-preview-53--ukeplanen.netlify.app','previous_preview');
