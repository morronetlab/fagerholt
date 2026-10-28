/** Read-only AI job status: never fetch a school PDF or launch a model job. */
import {siteConfig} from '../../public/site-config.mjs';
import {getSchool,validGradeCode} from '../../lib/schools.mjs';
import {aiConfigured,cacheKey,openAIStore,readStatusToken,lockKey,failureKey} from '../../lib/ai-runtime.mjs';
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function createAIStatusHandler({storeFactory=openAIStore,env=process.env,now=Date.now}={}){
 return async request=>{
  if(request.method!=='GET')return reply({error:'Kun GET støttes'},405);
  if(!aiConfigured(env))return reply({error:'AI-status er utilgjengelig'},503);
  const token=new URL(request.url).searchParams.get('job');
  const info=readStatusToken(token,env.AI_JOB_SECRET,now());
  if(!info||!getSchool(info.school)||!validGradeCode(String(info.grade))||
   !Number.isInteger(info.year)||info.year<2020||info.year>2100||
   !Number.isInteger(info.week)||info.week<1||info.week>53||
   !/^[a-f0-9]{64}$/.test(info.hash||'')||
   typeof info.model!=='string'||info.model.length>90||
   typeof info.pdf!=='string'||info.pdf.length>1500)return reply({error:'Ugyldig eller utløpt jobb-ID'},400);
  try{
   const pdf=new URL(info.pdf);
   if(pdf.protocol!=='https:'||pdf.username||pdf.password||!siteConfig.allowedSourceHosts.includes(pdf.hostname)||!/\.pdf$/i.test(pdf.pathname))return reply({error:'Ugyldig PDF-kilde'},400);
   const key=cacheKey(info);
   const store=await storeFactory();
   const cached=await store.get(key,{type:'json',consistency:'strong'});
   if(cached?.parser==='ai'&&cached.schoolId===info.school&&cached.grade===String(info.grade)&&cached.year===info.year&&cached.week===info.week&&cached.pdf===info.pdf)
    return reply({...cached,aiStatus:'ready'});
   const [lock,failure]=await Promise.all([
    store.get(lockKey(key),{type:'json',consistency:'strong'}),
    store.get(failureKey(key),{type:'json',consistency:'strong'})
   ]);
   const active=Number(lock?.expiresAt)>now();
   const failed=Number(failure?.retryAt)>now();
   return reply({aiStatus:failed||!active?'failed':'processing',status:'partial',
    ...((failed||!active)?{warning:'Analysen ble ikke fullført. Prøv igjen for å starte et nytt forsøk.'}:{})});
  }catch(error){
   console.error('AI-status kunne ikke leses:',error?.message?.slice(0,100));
   return reply({error:'Kunne ikke kontrollere AI-status nå'},503);
  }
 };
}
export default createAIStatusHandler();
