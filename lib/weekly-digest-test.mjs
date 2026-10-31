/** Authenticated, one-parent, on-demand preview of the scheduled digest.
 * Same formatting and provider as the Sunday worker; no arbitrary recipient.
 * 24-hour rate limit and active opt-in are mandatory.
 */
import {getSchool,validGradeCode} from './schools.mjs';
import {buildWeeklyDigest,nextSundayDigestWeek} from './weekly-digest.mjs';
import {renderWeeklyDigestHtml} from './weekly-digest-html.mjs';
import {makeDigestService,serviceConfigured,getPublicData,openDigestStore} from './weekly-digest-dispatch.mjs';
import {mailConfigured,sendPlainEmail} from './mail-core.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff'}});
const ownOrigin=env=>{
 const url=new URL(env.URL);
 if(url.protocol!=='https:'||url.username||url.password||
  !(url.hostname==='skoleuka.no'||url.hostname==='www.skoleuka.no'||
    /^[a-z0-9-]+\.netlify\.app$/u.test(url.hostname)))throw Error('Untrusted production origin');
 return url.origin;
};
const validToken=header=>{
 const match=String(header||'').match(/^Bearer ([A-Za-z0-9_.-]{16,4096})$/u);
 return match?.[1]||null;
};
export function createDigestTestHandler({
 env=process.env,fetchImpl=fetch,now=()=>new Date(),
 storeFactory=openDigestStore,serviceFactory=makeDigestService,
 send=sendPlainEmail,loadSources=getPublicData}={}){
 return async request=>{
  if(request.method!=='POST')return response(405,{error:'Method not allowed'});
  if(env.WEEKLY_DIGEST_SEND_ENABLED!=='true'||!serviceConfigured(env)||
   !mailConfigured(env)||!env.SUPABASE_PUBLISHABLE_KEY)
   return response(503,{error:'E-posttest er ikke konfigurert.'});
  const origin=request.headers.get('Origin');
  if(origin&&!['https://skoleuka.no','https://www.skoleuka.no',
    'https://ukeplanen.netlify.app'].includes(origin))
   return response(403,{error:'Ugyldig opprinnelse.'});
  const bearer=validToken(request.headers.get('Authorization'));
  if(!bearer)return response(401,{error:'Du må logge inn.'});
  let user;
  try{
   const auth=await fetchImpl(env.SUPABASE_URL.replace(/\/$/u,'')+'/auth/v1/user',{
    headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,
     Authorization:'Bearer '+bearer,Accept:'application/json'},
    cache:'no-store',signal:AbortSignal.timeout(8000)
   });
   if(!auth.ok)return response(401,{error:'Ugyldig eller utløpt økt.'});
   user=await auth.json();
  }catch{return response(503,{error:'Kunne ikke bekrefte innloggingen.'});}
  if(!uuid.test(user?.id)||!user.email_confirmed_at||
   !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(user.email||''))
   return response(403,{error:'Test krever en verifisert foreldrekonto.'});
  try{
   const service=serviceFactory({fetchImpl,env});
   if(!await service.isSubscribed(user.id))
    return response(403,{error:'Meld deg på søndagsoppsummeringen først.'});
   const membership=await service.memberFamilies(user.id);
   const familyIds=[...new Set((membership||[]).map(x=>x.family_id).filter(x=>uuid.test(x)))].slice(0,10);
   if(!familyIds.length)return response(403,{error:'Ingen tilknyttet familiekonto.'});
   const children=await service.children(familyIds);
   const profiles=[...new Map((children||[])
    .filter(p=>getSchool(p.school_id)&&validGradeCode(p.grade))
    .map(p=>[p.school_id+'|'+p.grade,{
     school:p.school_id,grade:p.grade,group:p.group_name||''
    }])).values()].slice(0,10);
   if(!profiles.length)return response(403,{error:'Familien har ingen registrerte skolebarn.'});
   const store=await storeFactory(),at=now(),ms=at.getTime();
   const key='test-mail/'+user.id;
   const prev=await store.get('sent/'+key,{type:'json',consistency:'strong'});
   if(prev&&ms-Date.parse(prev.at)<24*60*60*1000)
    return response(429,{error:'Testmail kan sendes én gang per 24 timer.'});
   const oldLock=await store.get('locks/'+key,{type:'json',consistency:'strong'});
   if(oldLock&&Number(oldLock.expiresAt)<=ms)await store.delete('locks/'+key);
   const lock=await store.setJSON('locks/'+key,{expiresAt:ms+2*60*1000},{onlyIfNew:true});
   if(!lock.modified)return response(429,{error:'En testutsending pågår allerede.'});
   try{
    const origin=ownOrigin(env),calendar=nextSundayDigestWeek(at);
    const records=await Promise.all(profiles.map(p=>loadSources(origin,p,calendar,{fetchImpl})));
    const plans=new Map(),calendars=new Map();
    for(let i=0;i<profiles.length;i++){
     const p=profiles[i],data=records[i];
     if(data?.plan?.schoolId===p.school)plans.set(p.school+'|'+p.grade,data.plan);
     if(data?.municipal?.schoolId===p.school)calendars.set(p.school,data.municipal);
    }
    let health={status:'not_monitored',stale:true};
    try{
     const h=await fetchImpl(origin+'/api/source-health',{signal:AbortSignal.timeout(4500),cache:'no-store'});
     if(h.ok)health=await h.json();
    }catch{/* missing status is explicitly reflected in mail */}
    const digest=buildWeeklyDigest({profiles,plans,calendars,health,now:at});
    if(!await service.isSubscribed(user.id))
     return response(403,{error:'Abonnementet er slått av.'});
    const providerId=await send({to:user.email,subject:'TEST – '+digest.subject,
     text:'Dette er en testmail du ba om fra Min konto.\n\n'+digest.text,
     html:renderWeeklyDigestHtml(digest,{test:true}),
     idempotencyKey:'skoleuka-test-'+at.toISOString().slice(0,10)+'-'+user.id},
     {fetchImpl,env});
    await store.setJSON('sent/'+key,{at:at.toISOString(),providerId});
    return response(202,{status:'accepted',year:digest.year,week:digest.week});
   }finally{try{await store.delete('locks/'+key);}catch{}}
  }catch(error){
   console.warn('Parent digest test failed without identifiers',
    String(error?.message||'error').slice(0,90));
   return response(503,{error:'Kunne ikke sende testmail. Sjekk driftslogger og e-postleverandør.'});
  }
 };
}
