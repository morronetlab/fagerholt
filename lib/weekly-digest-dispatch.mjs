/** Opt-in only Sunday dispatch. Server-only Supabase service role + Resend.
 * The scheduled function runs on production only. Never enumerate emails publicly.
 */
import {getStore} from '@netlify/blobs';
import {getSchool,validGradeCode} from './schools.mjs';
import {buildWeeklyDigest,nextSundayDigestWeek} from './weekly-digest.mjs';
import {mailConfigured,sendPlainEmail} from './mail-core.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
export function serviceConfigured(env=process.env){
 try{
  const url=new URL(env.SUPABASE_URL||''),key=env.SUPABASE_SERVICE_ROLE_KEY||'';
  let privileged=typeof key==='string'&&key.startsWith('sb_secret_')&&key.length>=32;
  if(!privileged&&typeof key==='string'&&key.startsWith('eyJ')){
   const segments=key.split('.');
   privileged=segments.length===3&&
    JSON.parse(Buffer.from(segments[1],'base64url').toString('utf8')).role==='service_role';
  }
  return url.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/u.test(url.hostname)&&privileged;
 }catch{return false;}
}
export function makeDigestService({fetchImpl=fetch,env=process.env}={}){
 if(!serviceConfigured(env))throw Error('Supabase service role is missing');
 const base=env.SUPABASE_URL.replace(/\/$/u,'');
 const secret=env.SUPABASE_SERVICE_ROLE_KEY;
 // New sb_secret_ keys are opaque API keys, not JWTs. A Bearer header
 // would make Supabase try to validate them as user access tokens.
 // Legacy service_role JWTs still work with Authorization: Bearer.
 const serviceHeaders={'apikey':secret,'Accept':'application/json'};
 if(!secret.startsWith('sb_secret_'))serviceHeaders.Authorization='Bearer '+secret;
 const json=async(path)=>{
  const response=await fetchImpl(base+path,{headers:serviceHeaders,
   signal:AbortSignal.timeout(8500),cache:'no-store'});
  if(!response.ok)throw Error('Supabase request failed '+response.status);
  return response.json();
 };
 return {
  subscribers:()=>json('/rest/v1/weekly_digest_subscriptions?select=user_id&enabled=eq.true&order=user_id.asc&limit=200'),
  isSubscribed:async user=>{
   const rows=await json('/rest/v1/weekly_digest_subscriptions?select=user_id&user_id=eq.'+
    encodeURIComponent(user)+'&enabled=eq.true&limit=1');
   return Array.isArray(rows)&&rows.some(r=>r.user_id===user);
  },
  memberFamilies:user=>json('/rest/v1/family_members?select=family_id&user_id=eq.'+
   encodeURIComponent(user)+'&role=in.(owner,parent)&limit=25'),
  children:families=>json('/rest/v1/children?select=school_id,grade,group_name&family_id=in.('+
   families.map(encodeURIComponent).join(',')+')&limit=60'),
  user:id=>json('/auth/v1/admin/users/'+encodeURIComponent(id))
 };
}
export async function openDigestStore(){
 return getStore({name:'ukeplan-weekly-digest',region:process.env.AI_BLOBS_REGION||
  'eu-central-1',consistency:'strong'});
}
function ownOrigin(env){
 const raw=env.URL||'';
 const url=new URL(raw);
 if(url.protocol!=='https:'||url.username||url.password||
  !(url.hostname==='skoleuka.no'||url.hostname==='www.skoleuka.no'||
    /^[a-z0-9-]+\.netlify\.app$/u.test(url.hostname)))throw Error('Untrusted production origin');
 return url.origin;
}
export function dispatchWindow(date=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
  timeZone:'Europe/Oslo',weekday:'short',hour:'2-digit',hourCycle:'h23'
 }).formatToParts(date).map(x=>[x.type,x.value]));
 return parts.weekday==='Sun'&&Number(parts.hour)>=18&&Number(parts.hour)<=21;
}
export async function getPublicData(origin,profile,calendar,{fetchImpl=fetch}={}){
 const retrieve=async(path)=>{
  const response=await fetchImpl(origin+path,{headers:{Accept:'application/json'},
   signal:AbortSignal.timeout(8500),cache:'no-store'});
  if(!response.ok)throw Error('Source request failed '+response.status);
  return response.json();
 };
 const school=encodeURIComponent(profile.school),grade=encodeURIComponent(profile.grade);
 const params='?school='+school+'&year='+calendar.year+'&week='+calendar.week;
 const [schoolCalendar,plan]=await Promise.allSettled([
  retrieve('/api/school-calendar'+params),
  retrieve('/api/plan?school='+school+'&grade='+grade+'&nextWeek=1')
 ]);
 return {municipal:schoolCalendar.status==='fulfilled'?schoolCalendar.value:null,
  plan:plan.status==='fulfilled'?plan.value:null};
}
async function obtainClaim(store,key,now){
 const lock='locks/'+key,existing=await store.get(lock,{type:'json',consistency:'strong'});
 if(existing){
  if(existing.expiresAt>now)return null;
  await store.delete(lock);
 }
 const result=await store.setJSON(lock,{expiresAt:now+13*60_000},{onlyIfNew:true});
 return result.modified===true?lock:null;
}
export async function runWeeklyDigestDispatch({
 now=()=>new Date(),env=process.env,fetchImpl=fetch,
 serviceFactory=makeDigestService,storeFactory=openDigestStore,
 send=sendPlainEmail,loadSources=getPublicData}={}){
 const date=now();
 if(env.WEEKLY_DIGEST_SEND_ENABLED!=='true'||!serviceConfigured(env)||
  !mailConfigured(env))
  return {status:'disabled',sent:0};
 if(!dispatchWindow(date))return {status:'outside-window',sent:0};
 const canary=env.WEEKLY_DIGEST_CANARY_USER_ID||null;
 // Fail closed before any privileged reads when test recipient is invalid.
 if(canary&&!uuid.test(canary))return {status:'invalid-canary',sent:0};
 const origin=ownOrigin(env),service=serviceFactory({fetchImpl,env});
 const store=await storeFactory();
 const subs=await service.subscribers();
 if(!Array.isArray(subs))throw Error('Invalid subscriber response');

 const calendar=nextSundayDigestWeek(date);
 const keyPrefix=calendar.year+'-'+String(calendar.week).padStart(2,'0');
 let sent=0,skipped=0,failed=0,attempted=0;
 const pending=[];
 for(const row of subs.slice(0,200)){
  if(!uuid.test(row?.user_id)||canary&&row.user_id!==canary)continue;
  const key=keyPrefix+'/'+row.user_id;
  if(await store.get('sent/'+key,{type:'json',consistency:'strong'})||
     await store.get('skip/'+key,{type:'json',consistency:'strong'})){
    skipped++;continue;
  }
  pending.push({userId:row.user_id,key});
  if(pending.length>=3)break;
 }
 async function process(item){
  const lock=await obtainClaim(store,item.key,date.getTime());
  if(!lock)return {kind:'skipped'};
  try{
   const member=await service.memberFamilies(item.userId);
   const ids=[...new Set((member||[]).map(x=>x.family_id).filter(x=>uuid.test(x)))].slice(0,10);
   if(!ids.length){
    await store.setJSON('skip/'+item.key,{reason:'no_parent_membership',year:calendar.year,week:calendar.week});
    return {kind:'skipped'};
   }
   const user=await service.user(item.userId);
   if(user?.id!==item.userId||!user.email_confirmed_at||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(user.email||'')){
    await store.setJSON('skip/'+item.key,{reason:'unverified_email',year:calendar.year,week:calendar.week});
    return {kind:'skipped'};
   }
   const children=await service.children(ids);
   const profiles=(children||[]).filter(p=>getSchool(p.school_id)&&validGradeCode(p.grade))
    .map(p=>({school:p.school_id,grade:p.grade,group:p.group_name||''}));
   if(!profiles.length){
    await store.setJSON('skip/'+item.key,{reason:'no_supported_children',year:calendar.year,week:calendar.week});
    return {kind:'skipped'};
   }
   const unique=[...new Map(profiles.map(p=>[p.school+'|'+p.grade,p])).values()];
   const data=await Promise.all(unique.map(p=>loadSources(origin,p,calendar,{fetchImpl})));
   const plans=new Map(),calendars=new Map();
   for(let i=0;i<unique.length;i++){
    const p=unique[i],record=data[i];
    if(record?.plan?.schoolId===p.school)plans.set(p.school+'|'+p.grade,record.plan);
    if(record?.municipal?.schoolId===p.school)calendars.set(p.school,record.municipal);
   }
   let health=null;
   try{
    const response=await fetchImpl(origin+'/api/source-health',{
     signal:AbortSignal.timeout(4500),cache:'no-store'});
    if(response.ok)health=await response.json();
   }catch{}
   const digest=buildWeeklyDigest({profiles:unique,plans,calendars,health,now:date});
   // Do not mark an incomplete briefing as sent. Try again at the next run.
   if(digest.missingPlans>0)return {kind:'deferred'};
   // Check again as close to delivery as possible: parents may opt out
   // while the source PDFs are being loaded.
   if(!await service.isSubscribed(item.userId)){
    await store.setJSON('skip/'+item.key,{reason:'unsubscribed',year:calendar.year,week:calendar.week});
    return {kind:'skipped'};
   }
   const providerId=await send({to:user.email,subject:digest.subject,text:digest.text,html:digest.html,
    idempotencyKey:'skoleuka-week-'+keyPrefix+'-'+item.userId},
    {fetchImpl,env});
   await store.setJSON('sent/'+item.key,{at:date.toISOString(),providerId,
    year:calendar.year,week:calendar.week});
   return {kind:'sent'};
  }catch(error){
   console.warn('Sunday digest recipient failed (without identifier)',
    String(error?.message||'unknown').slice(0,100));
   return {kind:'failed'};
  }finally{try{await store.delete(lock);}catch{
   console.warn('Sunday digest claim cleanup unavailable');
  }}
 }
 // Bound each 30s scheduled invocation. Repeated 15-minute invocations
 // advance past completed users; the provider idempotency key guards retries.
 const results=await Promise.all(pending.map(process));
 for(const result of results){
  attempted++;
  if(result.kind==='sent')sent++;
  else if(result.kind==='failed')failed++;
  else if(result.kind==='deferred')skipped++;
  else skipped++;
 }
 console.info('ukeplan.digest_dispatch',JSON.stringify({year:calendar.year,week:calendar.week,
  subscribers:subs.length,canaryMode:Boolean(canary),attempted,sent,skipped,failed}));
 return {status:'complete',sent,skipped,failed,attempted};
}
