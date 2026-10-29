import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {AI_SCHEMA_VERSION} from './ai-plan.mjs';

const STORE_NAME='ukeplan-ai';
export const digestPdf=bytes=>createHash('sha256').update(bytes).digest('hex');
export const aiConfigured=(env=process.env)=>Boolean(env.OPENAI_API_KEY&&env.AI_JOB_SECRET&&env.AI_JOB_SECRET.length>=24);
export const cacheKey=({school,grade,year,week,hash,model='gpt-4.1-mini'})=>{
 const safe=s=>String(s).replace(/[^a-zA-Z0-9_-]/g,'_');
 return `v${AI_SCHEMA_VERSION}/${safe(school)}/${safe(grade)}/${year}-${week}/${hash}-${safe(model)}.json`;
};
export const lockKey=key=>`locks/${key}`;
export const failureKey=key=>`failures/${key}`;
export async function openAIStore(){
 const {getStore}=await import('@netlify/blobs');
 return getStore({name:STORE_NAME,region:process.env.AI_BLOBS_REGION||'eu-central-1',consistency:'strong'});
}
export const signJob=(payload,secret)=>createHmac('sha256',secret).update(payload).digest('hex');
export function validSignature(payload,signature,secret){
 if(!secret||typeof signature!=='string'||!/^[\da-f]{64}$/.test(signature))return false;
 return timingSafeEqual(Buffer.from(signJob(payload,secret)),Buffer.from(signature));
}
/** A signed handle for public school documents, never containing credentials.
 * The read-only status route needs neither the school website nor the PDF bytes.
 */
export function createStatusToken(data,secret,now=Date.now()){
 if(!secret)throw new Error('Missing signing secret');
 const payload={...data,version:AI_SCHEMA_VERSION,expiresAt:now+24*60*60*1000};
 const message=Buffer.from(JSON.stringify(payload)).toString('base64url');
 return `${message}.${signJob(message,secret)}`;
}
export function readStatusToken(token,secret,now=Date.now()){
 if(typeof token!=='string'||token.length>3200||!/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(token))return null;
 const [message,signature]=token.split('.');
 if(!validSignature(message,signature,secret))return null;
 try{
  const payload=JSON.parse(Buffer.from(message,'base64url').toString('utf8'));
  if(!payload||payload.version!==AI_SCHEMA_VERSION||!Number.isFinite(payload.expiresAt)||payload.expiresAt<=now||payload.expiresAt>now+24*60*60*1000)return null;
  return payload;
 }catch{return null;}
}

export function jobOrigin(request,env=process.env){
 const incoming=new URL(request.url);
 if(['localhost','127.0.0.1'].includes(incoming.hostname))return incoming.origin;
 const production=env.URL?new URL(env.URL):null;
 // Netlify Functions expose SITE_NAME and URL at runtime. DEPLOY_URL may be
 // build-only, so falling back to URL would route preview jobs to production.
 const siteName=String(env.SITE_NAME||
   (production?.hostname.endsWith('.netlify.app')?production.hostname.slice(0,-'.netlify.app'.length):''));
 const validSite=/^[a-z0-9-]+$/.test(siteName);
 const ownNetlifyHost=validSite&&(
   incoming.hostname===`${siteName}.netlify.app`||
   incoming.hostname.endsWith(`--${siteName}.netlify.app`));
 if(incoming.protocol==='https:'&&(ownNetlifyHost||incoming.origin===production?.origin))
   return incoming.origin;
 // For nonstandard proxy hosts, prefer an explicitly configured deploy URL.
 if(env.DEPLOY_URL){const target=new URL(env.DEPLOY_URL);if(target.protocol==='https:')return target.origin;}
 if(production?.protocol==='https:')return production.origin;
 throw new Error('Ukjent intern Netlify-adresse');
}
export async function acquireJob(store,key,now=Date.now()){
 const lock=lockKey(key);
 const state=await store.get(lock,{type:'json',consistency:'strong'});
 if(state&&Number(state.expiresAt)>now)return false;
 if(state){await store.delete(lock);}
 const result=await store.setJSON(lock,{createdAt:now,expiresAt:now+10*60_000},{onlyIfNew:true});
 return result.modified===true;
}
export async function releaseJob(store,key){await store.delete(lockKey(key));}
export async function queueAIJob({request,job,key,store,dispatchImpl=fetch,env=process.env,now=Date.now}){
 // Background function records a failed attempt. Never re-dispatch every 15s during cooldown.
 const failure=await store.get(failureKey(key),{type:'json',consistency:'strong'});
 if(Number(failure?.retryAt)>now())return 'failed';
 if(!await acquireJob(store,key,now()))return 'processing';
 try{
   const body=JSON.stringify(job);
   const destination=jobOrigin(request,env)+'/.netlify/functions/ai-plan-background';
   const result=await dispatchImpl(destination,{method:'POST',headers:{'Content-Type':'application/json','X-Weekplan-Signature':signJob(body,env.AI_JOB_SECRET)},body,signal:AbortSignal.timeout(12000)});
   if(result.status!==202)throw new Error(`Background invocation ${result.status}`);
   return 'processing';
 }catch(err){await releaseJob(store,key);throw err;}
}
