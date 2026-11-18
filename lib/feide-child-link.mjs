/**
 * Feide PR 2: parent-initiated, dual-confirmed binding of a Feide identity
 * to an existing child record. NO data access or device credential is issued.
 *
 * Privacy: Feide sub is HMAC-hashed, secrets are never returned to guardians,
 * clients cannot read these server-only RLS tables directly.
 */
import {randomBytes, randomInt, createHash, createHmac, timingSafeEqual} from 'node:crypto';
import {FEIDE_ISSUER, feideOrigin, feideSubjectFromCookie, configReady} from './feide-oidc.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const INVITE=/^[a-f0-9]{64}$/u;
const PIN=/^\d{6}$/u;
const INVITE_MS=10*60_000;
const sha256=s=>createHash('sha256').update(s).digest('hex');
// Confirmation comparison is performed atomically under PostgreSQL row lock.
const keyBytes=(raw)=>{
  if(!/^[A-Za-z0-9_-]{43,44}$/.test(raw||''))throw Error('Missing Feide secret');
  const key=Buffer.from(raw,'base64url');
  if(key.length!==32)throw Error('Invalid Feide secret');
  return key;
};
export const feidePinKey=env=>keyBytes(env.CONTEXT==='production'?env.FEIDE_LINK_PIN_KEY:env.FEIDE_POC_COOKIE_KEY);
const safeError=(status,error)=>new Response(JSON.stringify({error}),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
  'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'
}});
const response=(status,payload)=>new Response(JSON.stringify(payload),{
  status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
  'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'}
});
export function subjectDigest(sub,env) {
  const key=keyBytes(env.CONTEXT==='production'?env.FEIDE_SUBJECT_HASH_KEY:env.FEIDE_POC_COOKIE_KEY);
  if(key.length!==32||typeof sub!=='string'||!sub||sub.length>512)throw Error('Unverified Feide identity');
  // Issuer-separated, keyed pseudonym. Rotation invalidates preview links.
  return createHmac('sha256',key).update(FEIDE_ISSUER+'\u0000'+sub).digest('hex');
}
export const linkPreviewHost = (host,env)=>feideOrigin(env)==='https://'+host;

async function jsonInput(request){
 const input=await request.text();
 if(input.length>1500)throw Object.assign(Error('too_large'),{status:413});
 let data;try{data=JSON.parse(input||'{}');}catch{throw Object.assign(Error('bad_json'),{status:400})}
 if(!data||Array.isArray(data)||typeof data!=='object')throw Object.assign(Error('bad_json'),{status:400});
 return data;
}
async function supabase(fetchImpl,env,path,{method='GET',body=null,jwt=null,service=false,prefer=null}={}){
 const origin=new URL(env.SUPABASE_URL);
 if(origin.protocol!=='https:'||!/^[a-z0-9-]+\.supabase\.co$/u.test(origin.hostname))
  throw Error('Invalid Supabase URL');
 const key=service?env.SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_PUBLISHABLE_KEY;
 const headers={apikey:key,Accept:'application/json'};
 if(jwt)headers.Authorization='Bearer '+jwt;
 else if(service&&!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
 if(body!==null)headers['Content-Type']='application/json';
 if(prefer)headers.Prefer=prefer;
 const result=await fetchImpl(origin.origin+path,{method,headers,cache:'no-store',
  signal:AbortSignal.timeout(8000),body:body===null?undefined:JSON.stringify(body)});
 if(!result.ok)throw Object.assign(Error('supabase'),{status:result.status});
 const raw=await result.text();return raw?JSON.parse(raw):[];
}
const rows=(fetchImpl,env,table,query,opts={})=>supabase(fetchImpl,env,
  '/rest/v1/'+table+query,{...opts,service:true});
async function parentContext(request,fetchImpl,env,childId){
 if(!UUID.test(childId||''))return null;
 const jwt=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_.-]{20,4096})$/u)?.[1];
 if(!jwt)return null;
 const user=await supabase(fetchImpl,env,'/auth/v1/user',{jwt});
 if(!UUID.test(user?.id)||!user.email_confirmed_at||user.is_anonymous===true)return null;
 // Critically: this query runs with guardian JWT and existing RLS, NOT service role.
 const visible=await supabase(fetchImpl,env,'/rest/v1/children?select=id,family_id&id=eq.'+
   encodeURIComponent(childId)+'&limit=1',{jwt});
 return visible.length===1?{userId:user.id,child:visible[0]}:null;
}
const requiresParent=action=>['create','status','approve','revoke'].includes(action);

export function createFeideLinkHandler({env=process.env,fetchImpl=fetch,
  now=()=>new Date(),secret=()=>randomBytes(32).toString('hex'),
  pin=()=>String(randomInt(0,1000000)).padStart(6,'0')}={}) {
 return async request=>{
  const url=new URL(request.url),action=url.searchParams.get('action');
  if(url.protocol!=='https:'||!linkPreviewHost(url.hostname,env)||url.port)
   return safeError(404,'Ikke tilgjengelig.');
  if(!configReady(env)||!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY||
      !env.SUPABASE_PUBLISHABLE_KEY)
   return safeError(503,'Testmiljøet er ikke konfigurert.');
  // The Feide linking API uses only the known Supabase project with server
  // grants. Both preview and production are separately gated above.
  const dbHost=(()=>{try{return new URL(env.SUPABASE_URL).hostname}catch{return ''}})();
  if(dbHost!=='qxejliyfgfeigvxsqupg.supabase.co')
   return safeError(503,'Feide-testen er ikke koblet til riktig Supabase-prosjekt.');
  if(!['create','status','claim','approve','revoke','me'].includes(action||''))
   return safeError(404,'Ukjent handling.');
  if(request.method!==(action==='status'||action==='me'?'GET':'POST'))
   return safeError(405,'Ugyldig metode.');
  // All state-changing requests require same-origin JS; reject no Origin.
  if(request.method==='POST'&&(request.headers.get('Origin')!==url.origin ||
      !(request.headers.get('Content-Type')||'').startsWith('application/json')))
   return safeError(403,'Ugyldig forespørsel.');
  try{
   const input=request.method==='POST'?await jsonInput(request):{};
   const childId=request.method==='GET'?url.searchParams.get('childId'):input.childId;
   const parent=requiresParent(action)?await parentContext(request,fetchImpl,env,childId):null;
   if(requiresParent(action)&&!parent)return safeError(403,'Ingen tilgang til barnet.');
   const {userId,child}=parent||{};
   const familyId=child?.family_id;
   const subject=action==='claim'||action==='me'?
     feideSubjectFromCookie(request,env,now().getTime()):null;
   if((action==='claim'||action==='me')&&!subject)
    return safeError(401,'Logg inn med Feide først.');
   if(action==='me'){
    const digest=subjectDigest(subject,env);
    const links=await rows(fetchImpl,env,'feide_child_links',
      '?select=id&subject_hash=eq.'+digest+'&revoked_at=is.null&limit=1');
    return response(200,{authenticated:true,linked:links.length===1});
   }
   if(action==='status'){
    const [requests,links]=await Promise.all([
      rows(fetchImpl,env,'feide_link_requests','?select=id,expires_at,subject_hash,approved_at,failed_attempts&child_id=eq.'+
        encodeURIComponent(child.id)+'&family_id=eq.'+encodeURIComponent(familyId)+
        '&created_by=eq.'+encodeURIComponent(userId)+'&order=created_at.desc&limit=5'),
      rows(fetchImpl,env,'feide_child_links','?select=id&child_id=eq.'+
        encodeURIComponent(child.id)+'&family_id=eq.'+encodeURIComponent(familyId)+
        '&revoked_at=is.null&limit=1')
    ]);
    const pending=requests.filter(r=>!r.approved_at&&Date.parse(r.expires_at)>now().getTime())
      .map(r=>({requestId:r.id,expiresAt:r.expires_at,
        status:r.subject_hash?'awaiting-parent-confirmation':'awaiting-feide',
        locked:r.failed_attempts>=5}));
    return response(200,{linked:links.length===1,pending});
   }
   if(action==='create'){
    const linked=await rows(fetchImpl,env,'feide_child_links','?select=id&child_id=eq.'+
      encodeURIComponent(child.id)+'&family_id=eq.'+encodeURIComponent(familyId)+
      '&revoked_at=is.null&limit=1');
    if(linked.length)return safeError(409,'Barnet har allerede en Feide-kobling.');
    const count=await rows(fetchImpl,env,'feide_link_requests',
      '?select=id&child_id=eq.'+encodeURIComponent(child.id)+'&created_by=eq.'+
      encodeURIComponent(userId)+'&approved_at=is.null&expires_at=gt.'+
      encodeURIComponent(now().toISOString())+'&limit=3');
    if(count.length>=2)return safeError(429,'For mange aktive invitasjoner.');
    const token=secret();
    if(!INVITE.test(token))throw Error('Bad invitation secret');
    const expiry=new Date(now().getTime()+INVITE_MS).toISOString();
    const created=await rows(fetchImpl,env,'feide_link_requests','',{
      method:'POST',body:{child_id:child.id,family_id:familyId,created_by:userId,
        token_hash:sha256(token),expires_at:expiry},prefer:'return=representation'
    });
    if(created.length!==1)return safeError(503,'Invitasjonen kunne ikke opprettes.');
    return response(201,{requestId:created[0].id,expiresAt:expiry,
      link:url.origin+'/barn/feide/koble/?token='+token});
   }
   if(action==='claim'){
    if(!INVITE.test(input.token||''))return safeError(400,'Ugyldig lenke.');
    const digest=subjectDigest(subject,env);
    const code=pin();
    if(!PIN.test(code))throw Error('Bad confirmation code');
    const candidates=await rows(fetchImpl,env,'feide_link_requests',
      '?select=id&token_hash=eq.'+sha256(input.token)+
      '&expires_at=gt.'+encodeURIComponent(now().toISOString())+
      '&subject_hash=is.null&approved_at=is.null&limit=1');
    if(candidates.length!==1)return safeError(410,'Invitasjonen er utløpt eller brukt.');
    const requestId=candidates[0].id;
    const confirmationHash=createHmac('sha256',feidePinKey(env))
      .update(requestId+':'+code).digest('hex');
    const updated=await rows(fetchImpl,env,'feide_link_requests',
      '?id=eq.'+encodeURIComponent(requestId)+'&subject_hash=is.null&approved_at=is.null'+
      '&expires_at=gt.'+encodeURIComponent(now().toISOString()),{
       method:'PATCH',body:{subject_hash:digest,confirmation_hash:confirmationHash},
       prefer:'return=representation'});
    if(updated.length!==1)return safeError(409,'Invitasjonen er allerede brukt.');
    return response(200,{confirmationCode:code,
      message:'Vis denne engangskoden til foresatt for godkjenning.'});
   }
   if(action==='approve'){
    if(!UUID.test(input.requestId||'')||!PIN.test(input.code||''))
     return safeError(400,'Ugyldig bekreftelse.');
    // Authentication and child RLS were verified above. Compare-and-set,
    // PIN attempt count, unique link insert and request approval all happen
    // under ONE database transaction, serialized by SELECT ... FOR UPDATE.
    const actual=createHmac('sha256',feidePinKey(env))
      .update(input.requestId+':'+input.code).digest('hex');
    const result=await supabase(fetchImpl,env,'/rest/v1/rpc/feide_confirm_link',{
      method:'POST',service:true,body:{
        p_request_id:input.requestId,p_child_id:child.id,
        p_family_id:familyId,p_parent_id:userId,
        p_confirmation_hash:actual
      }
    });
    if(result==='linked')return response(200,{linked:true});
    if(result==='incorrect')return safeError(403,'Feil bekreftelseskode.');
    if(result==='locked')return safeError(429,'For mange feilforsøk. Lag en ny invitasjon.');
    if(result==='conflict')return safeError(409,'Barnet eller Feide-identiteten er allerede koblet.');
    return safeError(409,'Bekreftelsen er utløpt eller ikke lenger gyldig.');
   }
   if(action==='revoke'){
    await rows(fetchImpl,env,'feide_child_links',
      '?child_id=eq.'+encodeURIComponent(child.id)+'&family_id=eq.'+
      encodeURIComponent(familyId)+'&revoked_at=is.null',
      {method:'PATCH',body:{revoked_at:now().toISOString()},prefer:'return=minimal'});
    return response(200,{linked:false});
   }
   return safeError(404,'Ukjent handling.');
  }catch(error){
   if(error?.status===413)return safeError(413,'For stor forespørsel.');
   if(error?.status===400)return safeError(400,'Ugyldig JSON.');
   if(error?.status===401||error?.status===403)return safeError(401,'Økten er utløpt eller ikke autorisert.');
   if(error?.status===409)return safeError(409,'Feide-koblingen finnes allerede, eller er i konflikt.');
   if(error?.status===404||error?.status===406)return safeError(503,'Feide-databasetabeller er ikke klargjort.');
   // Never return token, subject, supabase message or caller identity in error.
   return safeError(503,'Koblingstjenesten er ikke tilgjengelig.');
  }
 };
}
