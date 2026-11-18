/**
 * Feide OIDC Authorization Code + PKCE and RP-Initiated Logout.
 * All tokens are verified and encrypted server-side, never exposed to JS.
 * Production is OFF by default and requires an explicit, canonical origin
 * and separate production-only secrets. Preview remains isolated.
 */
import {
  randomBytes, createHash, createCipheriv, createDecipheriv,
  createPublicKey, verify as verifySignature, timingSafeEqual
} from 'node:crypto';

export const FEIDE_ISSUER = 'https://auth.dataporten.no';
export const FEIDE_DISCOVERY = FEIDE_ISSUER + '/.well-known/openid-configuration';
export const POC_HOST = 'deploy-preview-172--ukeplanen.netlify.app';
export const POC_ORIGIN = 'https://' + POC_HOST;
export const CALLBACK = POC_ORIGIN + '/api/feide-oidc/callback';
export const COMPLETE = POC_ORIGIN + '/api/feide-oidc/complete';
export const PRODUCTION_ORIGIN = 'https://www.skoleuka.no';
export function feideOrigin(env) {
  if(env.CONTEXT==='production')
    return env.FEIDE_ENABLED==='true'&&env.FEIDE_ORIGIN===PRODUCTION_ORIGIN?
      PRODUCTION_ORIGIN:null;
  if((!env.CONTEXT||env.CONTEXT==='deploy-preview')&&env.FEIDE_POC_ENABLED==='true')
    return POC_ORIGIN;
  return null;
}
export const feideClientId=env=>env.CONTEXT==='production'?env.FEIDE_CLIENT_ID:env.FEIDE_POC_CLIENT_ID;
const feideClientSecret=env=>env.CONTEXT==='production'?env.FEIDE_CLIENT_SECRET:env.FEIDE_POC_CLIENT_SECRET;
export const feideSessionMs=env=>env.CONTEXT==='production'?2*60*60_000:15*60_000;

const COOKIE_FLOW='__Host-skoleuka-feide-flow';
const COOKIE_SESSION='__Host-skoleuka-feide-session';
export function feideSubjectFromCookie(request,env,now=Date.now()) {
  const origin=feideOrigin(env),key=keyFromEnv(env);
  if(!origin||!key||new URL(request.url).origin!==origin)return null;
  const session=unseal(COOKIE_SESSION,cookieValue(request,COOKIE_SESSION),
    key,now,feideSessionMs(env),new URL(origin).hostname);
  // The identity was verified at OIDC callback. Production uses its own
  // bounded local session; ID token expiry need not end that local session.
  return typeof session?.sub==='string'&&session.sub.length>0&&
    Number.isInteger(session.exp)&&
    (env.CONTEXT==='production'||now<session.exp*1000)?session.sub:null;
}
const COOKIE_LOGOUT='__Host-skoleuka-feide-logout';
const FLOW_MS=10*60_000;
const SESSION_MS=15*60_000; // preview default, production uses feideSessionMs(env)
const LOGOUT_MS=5*60_000;
const MAX_CLOCK_SKEW=60;
const jsonHeaders={
  'Cache-Control':'private, no-store, max-age=0',
  'Pragma':'no-cache',
  'Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff',
  'X-Robots-Tag':'noindex, nofollow',
  'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"
};
const b64url = bytes => Buffer.from(bytes).toString('base64url');
const bytes = s => Buffer.from(s,'base64url');
const randomString = () => b64url(randomBytes(32));
const cookieValue=(req,name)=>{
  const entries=(req.headers.get('cookie')||'').split(';').map(s=>s.trim());
  return entries.find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';
};
const cookie=(name,value,age)=>name+'='+value+
  '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+age;
const empty=name=>cookie(name,'',0);
const withCookies=(headers,cookies=[])=>{
  const h=new Headers({...jsonHeaders,...headers});
  for(const c of cookies)h.append('Set-Cookie',c);
  return h;
};
const go=(location,cookies=[])=>new Response(null,{
  status:303,headers:withCookies({Location:location},cookies)
});
const result=(code,body,cookies=[])=>new Response(JSON.stringify(body),{
  status:code,headers:withCookies({'Content-Type':'application/json; charset=utf-8'},cookies)
});
const safeEqual=(x,y)=>{
  if(typeof x!=='string'||typeof y!=='string')return false;
  const a=Buffer.from(x),b=Buffer.from(y);
  return a.length===b.length&&timingSafeEqual(a,b);
};
const keyFromEnv=env=>{
  const raw=(env.CONTEXT==='production'?env.FEIDE_SESSION_COOKIE_KEY:env.FEIDE_POC_COOKIE_KEY)||'';
  if(!/^[A-Za-z0-9_-]{43,44}$/.test(raw))return null;
  const key=bytes(raw);
  return key.length===32?key:null;
};
export const configReady=env=>Boolean(
  feideOrigin(env) &&
  /^[a-f0-9-]{36}$/iu.test(feideClientId(env)||'') &&
  typeof feideClientSecret(env)==='string' &&
  feideClientSecret(env).length>=12 &&
  keyFromEnv(env) &&
  (env.CONTEXT!=='production'||(
    /^[A-Za-z0-9_-]{43,44}$/.test(env.FEIDE_SUBJECT_HASH_KEY||'') &&
    Buffer.from(env.FEIDE_SUBJECT_HASH_KEY,'base64url').length===32 &&
    /^[A-Za-z0-9_-]{43,44}$/.test(env.FEIDE_LINK_PIN_KEY||'') &&
    Buffer.from(env.FEIDE_LINK_PIN_KEY,'base64url').length===32
  ))
);

export function seal(name,data,key,host=POC_HOST) {
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(name+'@'+host));
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]);
  return b64url(Buffer.concat([iv,cipher.getAuthTag(),encrypted]));
}
export function unseal(name,value,key,now=Date.now(),ttl=FLOW_MS,host=POC_HOST) {
  if(!value||value.length>6000||!/^[a-zA-Z0-9_-]+$/.test(value))return null;
  try {
    const data=bytes(value);
    if(data.length<29)return null;
    const iv=data.subarray(0,12),tag=data.subarray(12,28),ciphertext=data.subarray(28);
    const decipher=createDecipheriv('aes-256-gcm',key,iv);
    decipher.setAAD(Buffer.from(name+'@'+host));
    decipher.setAuthTag(tag);
    const parsed=JSON.parse(Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8'));
    if(!Number.isFinite(parsed?.createdAt)||parsed.createdAt>now+MAX_CLOCK_SKEW*1000||
        now-parsed.createdAt>ttl)return null;
    return parsed;
  }catch{return null;}
}
const strictEndpoint=(url)=>{
  const u=new URL(url);
  if(u.protocol!=='https:'||u.hostname!=='auth.dataporten.no'||
    u.username||u.password||u.port||u.hash||u.search)throw Error('Feide endpoint host invalid');
  return u.toString();
};
async function fetchDiscovery(fetchImpl) {
  const r=await fetchImpl(FEIDE_DISCOVERY,{cache:'no-store',signal:AbortSignal.timeout(9000)});
  if(!r.ok)throw Error('Feide discovery unavailable');
  const d=await r.json();
  if(d.issuer!==FEIDE_ISSUER)throw Error('Feide issuer mismatch');
  const auth=strictEndpoint(d.authorization_endpoint);
  const token=strictEndpoint(d.token_endpoint);
  const jwks=strictEndpoint(d.jwks_uri);
  const end=strictEndpoint(d.end_session_endpoint||FEIDE_ISSUER+'/openid/endsession');
  if(!auth.endsWith('/oauth/authorization')||!token.endsWith('/oauth/token')||
      !end.endsWith('/openid/endsession'))throw Error('Unexpected Feide endpoint');
  return {auth,token,jwks,end};
}
export async function validateFeideIdToken(idToken,{jwksUrl,clientId,nonce,fetchImpl,now}) {
  if(typeof idToken!=='string'||idToken.length>2600)throw Error('Feide ID-token cannot fit secure session cookie');
  const seg=idToken.split('.');
  if(seg.length!==3||seg.some(x=>!x||!/^[A-Za-z0-9_-]+$/.test(x)))throw Error('Malformed ID token');
  const header=JSON.parse(bytes(seg[0]).toString('utf8'));
  const claims=JSON.parse(bytes(seg[1]).toString('utf8'));
  if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>128||
     header.crit||header.jku||header.jwk||header.x5u)throw Error('Unsupported Feide signing algorithm');
  if(claims.iss!==FEIDE_ISSUER ||
      !(claims.aud===clientId||(Array.isArray(claims.aud)&&claims.aud.includes(clientId))) ||
      (Array.isArray(claims.aud)&&claims.aud.length>1&&claims.azp!==clientId) ||
      typeof claims.sub!=='string'||!claims.sub||claims.sub.length>512 ||
      !safeEqual(claims.nonce,nonce))throw Error('Feide identity claims invalid');
  const nowSec=Math.floor(now/1000);
  if(!Number.isInteger(claims.iat)||claims.iat>nowSec+MAX_CLOCK_SKEW ||
      !Number.isInteger(claims.exp)||claims.exp<nowSec-MAX_CLOCK_SKEW ||
      (claims.nbf!==undefined&&(!Number.isInteger(claims.nbf)||claims.nbf>nowSec+MAX_CLOCK_SKEW)))
    throw Error('Feide token expired or not yet valid');
  const jwksResp=await fetchImpl(jwksUrl,{cache:'no-store',signal:AbortSignal.timeout(9000)});
  if(!jwksResp.ok)throw Error('Feide signing keys unavailable');
  const jwks=await jwksResp.json();
  if(!Array.isArray(jwks.keys)||jwks.keys.length>100)throw Error('Invalid Feide signing keys');
  const jwk=jwks.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&
    (!k.use||k.use==='sig')&&(!k.alg||k.alg==='RS256'));
  if(!jwk)throw Error('Unknown Feide signing key');
  const key=createPublicKey({key:jwk,format:'jwk'});
  if(!verifySignature('RSA-SHA256',Buffer.from(seg[0]+'.'+seg[1]),key,bytes(seg[2])))
    throw Error('Invalid Feide token signature');
  return {subject:claims.sub,expires:claims.exp};
}
const statusPage=kind=>POC_ORIGIN+'/barn/feide/slo/?result='+kind;

export function createFeideOidcHandler({env=process.env,fetchImpl=fetch,now=()=>Date.now()}={}) {
  return async request=>{
    const url=new URL(request.url);
    const origin=feideOrigin(env);
    // Hard fail on unconfigured hosts, preview mismatch or production disabled.
    if(url.protocol!=='https:'||!origin||url.origin!==origin||url.port)
      return result(404,{error:'Not available'});
    const host=url.hostname;
    const callback=origin+'/api/feide-oidc/callback';
    const complete=origin+'/api/feide-oidc/complete';
    const statusPage=kind=>origin+'/barn/feide/slo/?result='+kind;
    const sealHere=(name,data)=>seal(name,data,keyFromEnv(env),host);
    const unsealHere=(name,value,ttl)=>unseal(name,value,keyFromEnv(env),now(),ttl,host);
    const op=url.pathname.split('/').pop();
    if(request.method!=='GET'||!['status','start','callback','logout','complete'].includes(op))
      return result(405,{error:'Not available'});
    if(!configReady(env))return op==='status'?result(200,{ready:false,authenticated:false}):
      result(503,{error:'Test configuration missing'});
    const key=keyFromEnv(env);
    try {
      if(op==='status'){
        return result(200,{ready:true,authenticated:Boolean(feideSubjectFromCookie(request,env,now()))});
      }
      if(op==='start'){
        const discovery=await fetchDiscovery(fetchImpl);
        const state=randomString(),nonce=randomString(),verifier=randomString();
        const purpose=['link','child'].includes(url.searchParams.get('return'))?
          url.searchParams.get('return'):'test';
        const challenge=b64url(createHash('sha256').update(verifier).digest());
        const target=new URL(discovery.auth);
        for(const [k,v] of Object.entries({client_id:env.FEIDE_POC_CLIENT_ID,
          redirect_uri:callback,response_type:'code',scope:'openid',
          state,nonce,code_challenge:challenge,code_challenge_method:'S256'}))
          target.searchParams.set(k,v);
        const data=sealHere(COOKIE_FLOW,{createdAt:now(),state,nonce,verifier,purpose});
        return go(target.href,[cookie(COOKIE_FLOW,data,600),empty(COOKIE_SESSION),empty(COOKIE_LOGOUT)]);
      }
      if(op==='callback'){
        const flow=unsealHere(COOKIE_FLOW,cookieValue(request,COOKIE_FLOW),FLOW_MS);
        const clear=[empty(COOKIE_FLOW)];
        if(url.searchParams.has('error'))
          return go(statusPage('login-cancelled'),clear);
        const state=url.searchParams.get('state'),code=url.searchParams.get('code');
        if(!flow||!safeEqual(state,flow.state)||!code||code.length>2048)
          return go(statusPage('login-invalid'),clear);
        const discovery=await fetchDiscovery(fetchImpl);
        const form=new URLSearchParams({grant_type:'authorization_code',code,
          redirect_uri:callback,client_id:feideClientId(env),code_verifier:flow.verifier});
        const credentials=Buffer.from(feideClientId(env)+':'+feideClientSecret(env)).toString('base64');
        const r=await fetchImpl(discovery.token,{
          method:'POST',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(9000),
          headers:{Authorization:'Basic '+credentials,'Content-Type':'application/x-www-form-urlencoded',
            Accept:'application/json'},body:form
        });
        if(!r.ok)return go(statusPage('login-invalid'),clear);
        const tokens=await r.json();
        const validated=await validateFeideIdToken(tokens.id_token,{
          jwksUrl:discovery.jwks,clientId:feideClientId(env),
          nonce:flow.nonce,fetchImpl,now:now()
        });
        const session=sealHere(COOKIE_SESSION,{createdAt:now(),idToken:tokens.id_token,
          sub:validated.subject,exp:validated.expires});
        if(session.length>3800)return go(statusPage('login-invalid'),clear);
        const destination=flow.purpose==='link'?origin+'/barn/feide/koble/?result=signed-in':
          flow.purpose==='child'?origin+'/barn/':statusPage('signed-in');
        return go(destination,[...clear,cookie(COOKIE_SESSION,session,Math.floor(feideSessionMs(env)/1000))]);
      }
      if(op==='logout'){
        const session=unsealHere(COOKIE_SESSION,cookieValue(request,COOKIE_SESSION),feideSessionMs(env));
        const returnTo=url.searchParams.get('return')==='child'?'child':'test';
        if(!session?.idToken)return go(returnTo==='child'?origin+'/barn/?feide=already-logged-out':
          statusPage('already-logged-out'),[empty(COOKIE_SESSION)]);
        const discovery=await fetchDiscovery(fetchImpl);
        const state=randomString(),flow=sealHere(COOKIE_LOGOUT,{createdAt:now(),state,returnTo});
        const end=new URL(discovery.end);
        end.searchParams.set('id_token_hint',session.idToken);
        end.searchParams.set('post_logout_redirect_uri',complete);
        end.searchParams.set('state',state);
        // Remove the local session BEFORE redirecting to Feide.
        return go(end.href,[empty(COOKIE_SESSION),cookie(COOKIE_LOGOUT,flow,300)]);
      }
      if(op==='complete'){
        const flow=unsealHere(COOKIE_LOGOUT,cookieValue(request,COOKIE_LOGOUT),LOGOUT_MS);
        const state=url.searchParams.get('state');
        const match=Boolean(flow&&safeEqual(state,flow.state));
        const destination=flow?.returnTo==='child'?origin+'/barn/?feide='+
          (match?'logged-out':'logout-unconfirmed'):
          statusPage(match?'logged-out':'logout-unconfirmed');
        return go(destination,[empty(COOKIE_SESSION),empty(COOKIE_LOGOUT)]);
      }
      return result(405,{error:'Unsupported operation'});
    }catch{
      // Do not leak identity, tokens, Feide backend details, or bearer secrets.
      if(op==='callback')return go(statusPage('login-invalid'),[empty(COOKIE_FLOW),empty(COOKIE_SESSION)]);
      if(op==='logout')return go(statusPage('logout-unconfirmed'),[empty(COOKIE_SESSION)]);
      return result(503,{error:'Feide test request failed'});
    }
  };
}
