/** Parent-controlled pairing of one child to one read-only device.
 * Parent auth is checked against GoTrue and existing children RLS. All device
 * capabilities are 256-bit secrets stored ONLY as SHA-256 hashes in Supabase.
 * No service-role key ever crosses this API boundary.
 */
import {randomBytes,createHash} from 'node:crypto';
import qrcode from 'qrcode-generator';
import {familyActivityWeekDates} from '../public/shared/family-activities.mjs';
import {dayDate,schoolCalendar} from '../public/shared/calendar.mjs';
import {scopedHomeworkItems} from '../public/barn/child-learning.mjs';
import {taskFingerprint} from '../public/shared/task-fingerprint.mjs';
import {scopedPackingItems} from '../public/barn/child-learning.mjs';
import {packingFingerprint} from '../public/shared/packing-fingerprint.mjs';
import {DAYS} from '../public/shared/calendar.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const HEX=/^[a-f0-9]{64}$/u;
const PROGRESS_KEY=/^[a-f0-9]{16}$/u;
const fail=(status,error)=>reply(status,{error});
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private',
 'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
 'X-Robots-Tag':'noindex, nofollow','Vary':'Authorization'
}});
const sha256=s=>createHash('sha256').update(s).digest('hex');
const nowIso=now=>now().toISOString();
const after=(now,ms)=>new Date(now().getTime()+ms).toISOString();
export const PAIRING_VALID_MS=10*60_000;
export const DEVICE_VALID_MS=180*86400_000;
export const validChildAccessConfig=env=>{
 try{
  const url=new URL(env.SUPABASE_URL),secret=env.SUPABASE_SERVICE_ROLE_KEY,pub=env.SUPABASE_PUBLISHABLE_KEY;
  return url.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/u.test(url.hostname)
   &&secret?.length>=32&&pub?.length>=20&&
   (secret.startsWith('sb_secret_')||secret.startsWith('eyJ'))&&
   (pub.startsWith('sb_publishable_')||pub.startsWith('eyJ'));
 }catch{return false;}
};
function validatedOrigin(request){
 const url=new URL(request.url),host=url.hostname;
 const trusted=host==='skoleuka.no'||host==='www.skoleuka.no'||host==='ukeplanen.netlify.app'
  ||/^deploy-preview-\d+--ukeplanen\.netlify\.app$/u.test(host)
  ||(host==='localhost'&&url.protocol==='http:');
 return trusted&&(url.protocol==='https:'||host==='localhost')&&
  (!request.headers.get('Origin')||request.headers.get('Origin')===url.origin);
}
async function bodyJSON(request){
 const data=await request.text();
 if(data.length>2500)throw Error('too-large');
 return JSON.parse(data||'{}');
}
async function supa(fetchImpl,env,path,{method='GET',body=null,service=false,jwt=null,prefer=null}={}){
 const base=env.SUPABASE_URL.replace(/\/$/u,'');
 const key=service?env.SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_PUBLISHABLE_KEY;
 const headers={apikey:key,Accept:'application/json'};
 if(service&&!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
 if(jwt)headers.Authorization='Bearer '+jwt;
 if(prefer)headers.Prefer=prefer;
 if(body!==null)headers['Content-Type']='application/json';
 const res=await fetchImpl(base+path,{method,headers,body:body===null?undefined:JSON.stringify(body),
  signal:AbortSignal.timeout(8000),cache:'no-store'});
 if(!res.ok){
  // Keep secrets and full query strings out of logs. Status and endpoint
  // allow production troubleshooting without revealing pairing tokens.
  const endpoint=path.split('?')[0];
  console.error('[Skoleuka barnetilgang] Supabase request failed',{
   endpoint,status:res.status
  });
  throw Object.assign(Error('database'),{status:res.status});
 }
 const text=await res.text();
 return text?JSON.parse(text):[];
}
const rest=(fetchImpl,env,table,query,options={})=>
 supa(fetchImpl,env,'/rest/v1/'+table+query,{service:true,...options});
async function parentOwnsChild(request,fetchImpl,env,childId){
 if(!UUID.test(childId))return null;
 const bearer=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_.-]{20,4096})$/u)?.[1];
 if(!bearer)return null;
 let user;
 try{user=await supa(fetchImpl,env,'/auth/v1/user',{jwt:bearer});}
 catch(error){
  // Supabase Auth returns 403 with session_not_found for a revoked
  // or otherwise missing parent session. This is not a database failure.
  if(error.status===401||error.status===403)
   throw Object.assign(Error('guardian_session_invalid'),{status:401});
  throw error;
 }
 if(!UUID.test(user?.id)||!user.email_confirmed_at||user.is_anonymous===true)return null;
 // Existing RLS: only a member/guardian sees this child. The service key
 // is deliberately NOT used to authorize the parent.
 const query='?select=id,family_id,nickname,school_id,grade,group_name&id=eq.'+
  encodeURIComponent(childId)+'&limit=1';
 const response=await supa(fetchImpl,env,'/rest/v1/children'+query,{jwt:bearer});
 return response?.[0]&&{...response[0],userId:user.id};
}
function makeSvg(url){
 const qr=qrcode(0,'M');qr.addData(url);qr.make();
 return 'data:image/svg+xml;base64,'+Buffer.from(qr.createSvgTag({cellSize:5,margin:4}),'utf8')
  .toString('base64');
}
const childColumns='id,family_id,nickname,school_id,grade,group_name';
const uuidParam=s=>encodeURIComponent(s);
/** A child device can affect only the last/current/next school-week window.
 * This is independent of client-supplied date, family, child or identity. */
function permittedProgressWeek(year,week,now){
 if(!Number.isInteger(year)||year<2020||year>2100||
    !Number.isInteger(week)||week<1||week>53)return false;
 const monday=dayDate(year,week,0);
 if(typeof monday!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(monday))return false;
 const diff=(Date.parse(monday+'T12:00:00Z')-now().getTime())/86400000;
 return diff>=-15&&diff<=9;
}
/** Fail closed: progress writes must reference actual current/next-week homework
 * for this exact child's school, grade and group. The plan is fetched using
 * fixed server-owned parameters; no client-supplied plan or group is trusted.
 */
async function verifiedHomeworkKey(request,fetchImpl,now,child,year,week,key){
 const today=schoolCalendar(now(),'Europe/Oslo');
 const following=schoolCalendar(new Date(now().getTime()+7*86400_000),'Europe/Oslo');
 const isCurrent=year===today.year&&week===today.week;
 const isNext=year===following.year&&week===following.week;
 if(!isCurrent&&!isNext)return {status:400};
 const source=new URL('/api/plan',request.url);
 source.searchParams.set('school',child.school_id);
 source.searchParams.set('grade',String(child.grade));
 if(isNext)source.searchParams.set('nextWeek','1');
 let response,plan;
 try{
  response=await fetchImpl(source.toString(),{method:'GET',cache:'no-store',
   redirect:'error',signal:AbortSignal.timeout(18000)});
  if(!response.ok)return {status:503};
  plan=await response.json();
 }catch{return {status:503};}
 if(!plan||plan.year!==year||plan.week!==week||
    plan.grade!==String(child.grade)||
    (plan.schoolId&&plan.schoolId!==child.school_id)||
    !Array.isArray(plan.homework)||plan.parsedFromPdf===false||
    ['processing','failed'].includes(plan.aiStatus)||
    ['error','unavailable','unpublished','unreadable'].includes(plan.status))
  return {status:503};
 const allowed=scopedHomeworkItems(plan,{group:child.group_name||'',school:child.school_id,
  grade:String(child.grade)});
 const match=allowed.some(task=>taskFingerprint({school:child.school_id,
  grade:String(child.grade),year,week,task})===key);
 return {status:match?200:403};
}
async function childDeviceContext(request,fetchImpl,env,now){
 const token=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/u)?.[1];
 if(!token)return null;
 const sessions=await rest(fetchImpl,env,'child_device_sessions',
  '?select=id,family_id,child_id,expires_at&secret_hash=eq.'+sha256(token)+
  '&revoked_at=is.null&expires_at=gt.'+uuidParam(nowIso(now))+'&limit=1');
 if(sessions.length!==1)return null;
 const s=sessions[0];
 const found=await rest(fetchImpl,env,'children','?select='+childColumns+
  '&id=eq.'+uuidParam(s.child_id)+'&family_id=eq.'+uuidParam(s.family_id)+'&limit=1');
 if(found.length!==1)return null;
 return {s,child:found[0]};
}
export function createChildAccessHandler({env=process.env,fetchImpl=fetch,now=()=>new Date(),secret=()=>randomBytes(32).toString('hex')}={}){
 return async request=>{
  if(!validatedOrigin(request))return fail(403,'Ugyldig forespørsel.');
  if(!validChildAccessConfig(env))return fail(503,'Barnetilgang er ikke konfigurert.');
  try{
   const url=new URL(request.url),action=request.method==='GET'?
    url.searchParams.get('action'):null;
   const input=request.method==='POST'?await bodyJSON(request):{};
   const op=action||input.action;
   if(op==='create'&&request.method==='POST'){
    const child=await parentOwnsChild(request,fetchImpl,env,input.childId);
    if(!child)return fail(403,'Logg inn som foresatt for å dele barnets ukeplan.');
    const active=await rest(fetchImpl,env,'child_pairings','?select=id&child_id=eq.'+
     uuidParam(child.id)+'&redeemed_at=is.null&expires_at=gt.'+uuidParam(nowIso(now))+
     '&limit=10');
    if(active.length>=5)return fail(429,'For mange aktive QR-koder. Prøv igjen når en kode utløper.');
    const token=secret(),hash=sha256(token);
    await rest(fetchImpl,env,'child_pairings','',{method:'POST',body:{
     family_id:child.family_id,child_id:child.id,token_hash:hash,created_by:child.userId,
     expires_at:after(now,PAIRING_VALID_MS)
    },prefer:'return=minimal'});
    const link=url.origin+'/barn/?pair='+token;
    return reply(201,{link,qr:makeSvg(link),expiresAt:after(now,PAIRING_VALID_MS),childName:child.nickname});
   }
   if(op==='redeem'&&request.method==='POST'){
    const token=input.token;
    if(typeof token!=='string'||!HEX.test(token))return fail(400,'Ugyldig QR-kode.');
    // Compare-and-swap: first scan wins. A used code cannot create another device.
    const pair=await rest(fetchImpl,env,'child_pairings','?select=id,family_id,child_id'+
     '&token_hash=eq.'+sha256(token)+'&redeemed_at=is.null&expires_at=gt.'+
     uuidParam(nowIso(now))+'&limit=1',{method:'PATCH',body:{redeemed_at:nowIso(now)},
      prefer:'return=representation'});
    if(pair.length!==1)return fail(410,'QR-koden er brukt eller utløpt. Be en foresatt lage en ny.');
    const p=pair[0];
    const existing=await rest(fetchImpl,env,'child_device_sessions','?select=id&child_id=eq.'+
     uuidParam(p.child_id)+'&revoked_at=is.null&expires_at=gt.'+uuidParam(nowIso(now))+
     '&limit=8');
    if(existing.length>=6)return fail(429,'For mange aktive enheter. Be en foresatt fjerne en gammel.');
    const deviceToken=secret();
    await rest(fetchImpl,env,'child_device_sessions','',{method:'POST',body:{
     family_id:p.family_id,child_id:p.child_id,secret_hash:sha256(deviceToken),
     expires_at:after(now,DEVICE_VALID_MS)
    },prefer:'return=minimal'});
    return reply(201,{session:deviceToken,expiresAt:after(now,DEVICE_VALID_MS)});
   }
   // A scanned QR is a device activation, not a PWA install.
   // Only the child's active bearer capability can mark installation.
   if(op==='mark-installed'&&request.method==='POST'){
    const context=await childDeviceContext(request,fetchImpl,env,now);
    if(!context)return fail(401,'Enhetens tilgang er utløpt eller fjernet.');
    await rest(fetchImpl,env,'child_device_sessions',
     '?id=eq.'+uuidParam(context.s.id)+'&child_id=eq.'+uuidParam(context.child.id)+
     '&installed_at=is.null',
     {method:'PATCH',body:{installed_at:nowIso(now)},prefer:'return=minimal'});
    return reply(200,{installed:true});
   }
   // A child may revoke only their own current bearer session, never others.
   if(op==='self-revoke'&&request.method==='POST'){
    const deviceToken=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/u)?.[1];
    if(!deviceToken)return fail(401,'Enhetens tilgang er ikke gyldig.');
    const matched=await rest(fetchImpl,env,'child_device_sessions',
     '?select=id&secret_hash=eq.'+sha256(deviceToken)+'&revoked_at=is.null'+
     '&expires_at=gt.'+uuidParam(nowIso(now))+'&limit=1',{
      method:'PATCH',body:{revoked_at:nowIso(now)},prefer:'return=representation'
     });
    if(matched.length!==1)return fail(401,'Enhetens tilgang er allerede avsluttet.');
    return reply(200,{revoked:true});
   }
   if(op==='child'&&request.method==='GET'){
    const context=await childDeviceContext(request,fetchImpl,env,now);
    if(!context)return fail(401,'Tilgangen er utløpt eller fjernet av en foresatt.');
    const {s,child:p}=context;
    const year=Number(url.searchParams.get('year')),week=Number(url.searchParams.get('week'));
    const validWeek=Number.isInteger(year)&&year>=2020&&year<=2100&&
     Number.isInteger(week)&&week>=1&&week<=53;
    let activities=[];
    if(validWeek){
     const {start,end}=familyActivityWeekDates(year,week);
     const base='?select=id,child_id,title,occurs_on,start_time,end_time,repeat_rule,repeat_until,'+
      'location,responsible,notes&family_id=eq.'+uuidParam(s.family_id);
     const [one,weekly]=await Promise.all([
      rest(fetchImpl,env,'family_activities',base+'&repeat_rule=eq.none'+
       '&occurs_on=gte.'+start+'&occurs_on=lte.'+end+'&or=(child_id.is.null,child_id.eq.'+
        uuidParam(p.id)+')&limit=120'),
      rest(fetchImpl,env,'family_activities',base+'&repeat_rule=eq.weekly'+
       '&occurs_on=lte.'+end+'&or=(child_id.is.null,child_id.eq.'+
       uuidParam(p.id)+')&limit=150')
     ]);
     activities=[...(one||[]).filter(row=>row.repeat_rule==='none'&&
        row.occurs_on>=start&&row.occurs_on<=end),
       ...(weekly||[]).filter(row=>row.repeat_rule==='weekly'&&
        row.occurs_on<=end&&(!row.repeat_until||row.repeat_until>=start))]
      .filter(row=>row.child_id===null||row.child_id===p.id);
    }
    return reply(200,{child:{id:p.id,name:p.nickname,school:p.school_id,grade:p.grade,
     group:p.group_name||''},activities,expiresAt:s.expires_at});
   }
   if((op==='packing'&&request.method==='GET')||
      (op==='set-packing'&&request.method==='POST')){
    const context=await childDeviceContext(request,fetchImpl,env,now);
    if(!context)return fail(401,'Enhetens tilgang er utløpt.');
    const {s,child:p}=context;
    const year=Number(request.method==='GET'?url.searchParams.get('year'):input.year);
    const week=Number(request.method==='GET'?url.searchParams.get('week'):input.week);
    if(!permittedProgressWeek(year,week,now))
     return fail(400,'Ugyldig skoleuke.');
    const base='?select=task_key,completed&family_id=eq.'+uuidParam(s.family_id)+
     '&child_id=eq.'+uuidParam(p.id)+'&school_year=eq.'+year+
     '&school_week=eq.'+week+'&limit=120';
    if(op==='packing'){
     const rows=await rest(fetchImpl,env,'packing_progress',base);
     return reply(200,{progress:rows.map(r=>({key:r.task_key,completed:r.completed===true}))});
    }
    if(typeof input.completed!=='boolean'||typeof input.taskKey!=='string'||
      !PROGRESS_KEY.test(input.taskKey))return fail(400,'Ugyldig avkrysning.');
    const today=schoolCalendar(now(),'Europe/Oslo');
    const next=schoolCalendar(new Date(now().getTime()+7*86400_000),'Europe/Oslo');
    const current=year===today.year&&week===today.week;
    if(!current&&!(year===next.year&&week===next.week))
     return fail(400,'Kun inneværende og neste uke kan oppdateres.');
    const source=new URL('/api/plan',request.url);
    source.searchParams.set('school',p.school_id);
    source.searchParams.set('grade',String(p.grade));
    if(!current)source.searchParams.set('nextWeek','1');
    let plan;
    try{
     const response=await fetchImpl(source.toString(),{method:'GET',redirect:'error',
      cache:'no-store',signal:AbortSignal.timeout(18000)});
     if(!response.ok)return fail(503,'Pakkelisten kan ikke verifiseres akkurat nå.');
     plan=await response.json();
    }catch{return fail(503,'Pakkelisten kan ikke verifiseres akkurat nå.');}
    if(plan?.year!==year||plan?.week!==week||plan?.grade!==String(p.grade)||
      (plan.schoolId&&plan.schoolId!==p.school_id)||plan.parsedFromPdf===false||
      ['processing','failed'].includes(plan.aiStatus)||
      ['error','unavailable','unpublished','unreadable'].includes(plan.status))
      return fail(503,'Pakkelisten er ikke klar.');
    const profile={group:p.group_name||''};
    const valid=DAYS.some(day=>scopedPackingItems(plan,profile,day).some(item=>
      packingFingerprint({school:p.school_id,grade:String(p.grade),year,week,day,item})===
        input.taskKey));
    if(!valid)return fail(403,'Dette utstyret er ikke i barnets pakkeliste.');
    const rows=await rest(fetchImpl,env,'packing_progress',base);
    if(rows.length>=100&&!rows.some(r=>r.task_key===input.taskKey))
      return fail(429,'For mange avkrysninger for denne uka.');
    const saved=await rest(fetchImpl,env,'packing_progress',
     '?on_conflict=child_id,school_year,school_week,task_key',{
      method:'POST',body:{family_id:s.family_id,child_id:p.id,school_year:year,
       school_week:week,task_key:input.taskKey,completed:input.completed,
       updated_by_device:s.id},
      prefer:'resolution=merge-duplicates,return=representation'
     });
    if(saved.length!==1||saved[0].completed!==input.completed)
     return fail(503,'Pakkestatus ble ikke lagret.');
    return reply(200,{key:input.taskKey,completed:input.completed});
   }
   if((op==='progress'&&request.method==='GET')||
      (op==='set-progress'&&request.method==='POST')){
    const context=await childDeviceContext(request,fetchImpl,env,now);
    if(!context)return fail(401,'Tilgangen er utløpt eller fjernet av en foresatt.');
    const {s,child:p}=context;
    const year=Number(request.method==='GET'?url.searchParams.get('year'):input.year);
    const week=Number(request.method==='GET'?url.searchParams.get('week'):input.week);
    if(!permittedProgressWeek(year,week,now))
     return fail(400,'Du kan bare endre lekser fra inneværende eller nærliggende skoleuker.');
    const base='?select=task_key,completed&family_id=eq.'+uuidParam(s.family_id)+
     '&child_id=eq.'+uuidParam(p.id)+'&school_year=eq.'+year+
     '&school_week=eq.'+week+'&limit=120';
    if(op==='progress'){
     const entries=await rest(fetchImpl,env,'homework_progress',base);
     return reply(200,{progress:entries.map(row=>({key:row.task_key,completed:row.completed===true}))});
    }
    if(typeof input.completed!=='boolean'||typeof input.taskKey!=='string'||
       !PROGRESS_KEY.test(input.taskKey))return fail(400,'Ugyldig lekseavkrysning.');
    const verified=await verifiedHomeworkKey(request,fetchImpl,now,p,year,week,input.taskKey);
    if(verified.status!==200)return fail(verified.status,verified.status===403?
     'Denne leksen hører ikke til din ukeplan eller gruppe.':
     verified.status===400?'Du kan bare endre lekser i denne eller neste skoleuke.':
     'Ukeplanen kan ikke verifiseres akkurat nå. Prøv igjen.');
    // Defense in depth: retain row cap; task validation prevents fabricated entries.
    const existing=await rest(fetchImpl,env,'homework_progress',base);
    if(existing.length>=100&&!existing.some(row=>row.task_key===input.taskKey))
     return fail(429,'For mange lekser registrert i denne uka.');
    const saved=await rest(fetchImpl,env,'homework_progress',
     '?on_conflict=child_id,school_year,school_week,task_key',{
      method:'POST',body:{child_id:p.id,family_id:s.family_id,school_year:year,
       school_week:week,task_key:input.taskKey,completed:input.completed,
       updated_by_device:s.id},
      prefer:'resolution=merge-duplicates,return=representation'
     });
    if(saved.length!==1||saved[0].task_key!==input.taskKey||
       saved[0].completed!==input.completed)
     return fail(503,'Leksen ble ikke lagret. Prøv igjen.');
    return reply(200,{key:input.taskKey,completed:input.completed});
   }
   if((op==='status'&&request.method==='GET')||
   if((op==='devices'&&request.method==='GET')||
       (op==='revoke'&&request.method==='POST')){
    const childId=request.method==='GET'?url.searchParams.get('childId'):input.childId;
    const child=await parentOwnsChild(request,fetchImpl,env,childId);
    if(!child)return fail(403,'Kun foresatte kan administrere barnets enheter.');
    if(op==='status'){
     // Guardian authorization uses the existing children RLS. Return only
     // coarse state and never invitation secrets or device credentials.
     const [records,pending]=await Promise.all([
      rest(fetchImpl,env,'child_device_sessions',
       '?select=id,installed_at,expires_at,revoked_at&child_id=eq.'+
       uuidParam(child.id)+'&revoked_at=is.null&expires_at=gt.'+
       uuidParam(nowIso(now))+'&order=created_at.desc&limit=20'),
      rest(fetchImpl,env,'child_pairings',
       '?select=id&child_id=eq.'+uuidParam(child.id)+
       '&redeemed_at=is.null&expires_at=gt.'+uuidParam(nowIso(now))+'&limit=10')
     ]);
     const installed=records.some(row=>Boolean(row.installed_at));
     return reply(200,{status:installed?'installed':records.length?'activated':
      pending.length?'invited':'not_invited'});
    }
    if(op==='devices'){
     const records=await rest(fetchImpl,env,'child_device_sessions','?select=id,created_at,expires_at,revoked_at,last_seen_at,installed_at'+
      '&child_id=eq.'+uuidParam(child.id)+'&order=created_at.desc&limit=40');
     return reply(200,{devices:records});
    }
    if(!UUID.test(input.deviceId))return fail(400,'Ugyldig enhet.');
    await rest(fetchImpl,env,'child_device_sessions','?id=eq.'+uuidParam(input.deviceId)+
     '&child_id=eq.'+uuidParam(child.id)+'&family_id=eq.'+uuidParam(child.family_id),
     {method:'PATCH',body:{revoked_at:nowIso(now)},prefer:'return=minimal'});
    return reply(200,{revoked:true});
   }
   return fail(405,'Ugyldig handling.');
  }catch(err){
   // Never echo Supabase details, user input, auth tokens or invite secrets.
   if(err?.message==='too-large')return fail(413,'Forespørselen er for stor.');
   if(err?.status===401)return fail(401,'Innloggingen som foresatt er utløpt eller avsluttet. Lukk QR-vinduet og logg inn på nytt.');
   if(err?.status===404||err?.status===406)return fail(503,'Barnetilgang er ikke aktivert i databasen.');
   return fail(503,'Kunne ikke fullføre. Prøv igjen, eller kontakt foresatt.');
  }
 };
}
