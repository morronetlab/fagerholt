/**
 * Feide-only adapter for the existing child data API.
 * Authenticated Feide browser session => approved active child link =>
 * single child context. Never issues QR bearer credentials.
 */
import {FEIDE_ISSUER,POC_HOST,feideSubjectFromCookie,configReady} from './feide-oidc.mjs';
import {subjectDigest} from './feide-child-link.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const READ_ACTIONS=new Set(['child','progress','packing']);
const WRITE_ACTIONS=new Set(['set-progress','set-packing']);
const COLUMNS='id,family_id,nickname,school_id,grade,group_name';

export function feidePilotRequest(request,env,op){
 const url=new URL(request.url);
 if(url.protocol!=='https:'||url.port||url.hostname!==POC_HOST||
    (env.CONTEXT&&env.CONTEXT!=='deploy-preview')||!configReady(env)||
    request.headers.has('Authorization'))return false;
 if(request.method==='GET')return READ_ACTIONS.has(op);
 if(request.method==='POST')return WRITE_ACTIONS.has(op)&&request.headers.get('Origin')===url.origin&&
   (request.headers.get('Content-Type')||'').startsWith('application/json');
 return false;
}
async function serviceRows(fetchImpl,env,table,query){
 const base=new URL(env.SUPABASE_URL||'');
 if(base.protocol!=='https:'||base.hostname!=='qxejliyfgfeigvxsqupg.supabase.co'||
    !env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Unexpected Feide pilot Supabase project');
 const key=env.SUPABASE_SERVICE_ROLE_KEY;
 const headers={apikey:key,Accept:'application/json'};
 if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
 const res=await fetchImpl(base.origin+'/rest/v1/'+table+query,{
  method:'GET',headers,cache:'no-store',signal:AbortSignal.timeout(8000)
 });
 if(!res.ok)throw Error('Feide child lookup unavailable');
 return res.json();
}
/**
 * The active link is checked on EVERY child read or write. Revoking the link
 * immediately removes access, regardless of a previously verified cookie.
 * The cookie's Feide subject is used only on the server and never returned.
 */
export async function resolveFeideChildContext(request,fetchImpl,env,now,op){
 if(!feidePilotRequest(request,env,op))return null;
 const subject=feideSubjectFromCookie(request,env,now().getTime());
 if(!subject)return null;
 const hash=subjectDigest(subject,env);
 const links=await serviceRows(fetchImpl,env,'feide_child_links',
   '?select=id,child_id,family_id&subject_hash=eq.'+hash+'&revoked_at=is.null&limit=2');
 if(links.length!==1||!UUID.test(links[0].child_id)||!UUID.test(links[0].family_id))
   return null;
 const link=links[0];
 const found=await serviceRows(fetchImpl,env,'children','?select='+COLUMNS+
   '&id=eq.'+encodeURIComponent(link.child_id)+'&family_id=eq.'+
   encodeURIComponent(link.family_id)+'&limit=1');
 if(found.length!==1||found[0].id!==link.child_id||found[0].family_id!==link.family_id)
   return null;
 return {s:{id:null,family_id:link.family_id,feide:true,
   expires_at:new Date(now().getTime()+15*60_000).toISOString()},child:found[0]};
}
