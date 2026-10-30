/** On-demand AI ranking of an already cached, verified school PDF.
 * This is intentionally separate from the expensive original PDF analysis.
 * A signed source token prevents visitors from submitting arbitrary prompts.
 */
import {aiConfigured,cacheKey,openAIStore,readStatusToken,acquireJob,
 releaseJob,failureKey} from '../../lib/ai-runtime.mjs';
import {getSchool,validGradeCode} from '../../lib/schools.mjs';
import {rankingKey,rankingCandidates,rankPracticalPlan} from '../../lib/practical-priority.mjs';
import {siteConfig} from '../../public/site-config.mjs';

const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff'
}});
function validInfo(info){
 if(!info||!getSchool(info.school)||!validGradeCode(String(info.grade))||
  !Number.isInteger(info.year)||info.year<2020||info.year>2100||
  !Number.isInteger(info.week)||info.week<1||info.week>53||
  !/^[a-f0-9]{64}$/.test(info.hash||'')||typeof info.model!=='string'||
  info.model.length>90||typeof info.pdf!=='string'||info.pdf.length>1500)return false;
 try{
  const pdf=new URL(info.pdf);
  return pdf.protocol==='https:'&&siteConfig.allowedSourceHosts.includes(pdf.hostname)&&
   !pdf.username&&!pdf.password&&/\.pdf$/i.test(pdf.pathname);
 }catch{return false;}
}
export function createPracticalPriorityHandler({
 env=process.env,storeFactory=openAIStore,rank=rankPracticalPlan,now=Date.now
}={}){
 return async request=>{
  if(request.method!=='GET')return reply({error:'Kun GET støttes'},405);
  if(!aiConfigured(env))return reply({status:'unavailable'},503);
  const token=new URL(request.url).searchParams.get('job');
  const info=readStatusToken(token,env.AI_JOB_SECRET,now());
  if(!validInfo(info))return reply({status:'invalid',error:'Ugyldig eller utløpt token'},400);
  const aiKey=cacheKey(info),scoreKey=rankingKey(aiKey);
  let store=null,locked=false;
  try{
   store=await storeFactory();
   const plan=await store.get(aiKey,{type:'json',consistency:'strong'});
   if(plan?.parser!=='ai'||plan?.status!=='ok'||plan?.pdf!==info.pdf||
    plan?.schoolId!==info.school||plan?.grade!==String(info.grade)||
    plan?.year!==info.year||plan?.week!==info.week)return reply({status:'unavailable'},404);
   const cached=await store.get(scoreKey,{type:'json',consistency:'strong'});
   if(cached?.scores&&typeof cached.scores==='object')return reply({status:'ready',scores:cached.scores});
   if(!rankingCandidates(plan).length)return reply({status:'ready',scores:{}});
   const failed=await store.get(failureKey(scoreKey),{type:'json',consistency:'strong'});
   if(Number(failed?.retryAt)>now())return reply({status:'failed'});
   locked=await acquireJob(store,scoreKey,now());
   if(!locked)return reply({status:'processing'});
   const scores=await rank(plan,{apiKey:env.OPENAI_API_KEY,model:env.OPENAI_MODEL||'gpt-4.1-mini'});
   await store.setJSON(scoreKey,{scores,createdAt:new Date(now()).toISOString()});
   return reply({status:'ready',scores});
  }catch(error){
   console.warn('Practical priority unavailable:',String(error?.message||'error').slice(0,120));
   if(store&&locked)try{await store.setJSON(failureKey(scoreKey),{retryAt:now()+5*60_000});}catch{}
   return reply({status:'unavailable'},503);
  }finally{
   if(store&&locked)try{await releaseJob(store,scoreKey);}catch{}
  }
 };
}
export default createPracticalPriorityHandler();
