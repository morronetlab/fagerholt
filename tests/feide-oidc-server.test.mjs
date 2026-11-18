import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign as signJwt, randomBytes, randomUUID} from 'node:crypto';
import {
  POC_ORIGIN,POC_HOST,CALLBACK,COMPLETE,FEIDE_ISSUER,
  configReady,seal,unseal,validateFeideIdToken,createFeideOidcHandler
} from '../lib/feide-oidc.mjs';

const now=Date.parse('2026-11-18T08:35:00Z');
// Never embed the actual Feide client ID: Netlify scans env-variable values in source.
// A synthetic client ID exercises the same OIDC audience validation in tests.
const client=randomUUID();
const cookieKey=randomBytes(32);
const env={CONTEXT:'deploy-preview',FEIDE_POC_ENABLED:'true',
 FEIDE_POC_CLIENT_ID:client,FEIDE_POC_CLIENT_SECRET:'TEST_ONLY_never_real_secret',
 FEIDE_POC_COOKIE_KEY:cookieKey.toString('base64url')};
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'test-rsa',alg:'RS256',use:'sig'};
const b64=s=>Buffer.from(typeof s==='string'?s:JSON.stringify(s)).toString('base64url');
const signClaims=(claims)=> {
 const a=b64({alg:'RS256',kid:'test-rsa',typ:'JWT'}),b=b64(claims);
 return a+'.'+b+'.'+signJwt('RSA-SHA256',Buffer.from(a+'.'+b),privateKey).toString('base64url');
};
const req=(path,opts={})=>new Request(POC_ORIGIN+'/api/feide-oidc/'+path,opts);
const cookieOf=(r,name)=>{
 const values=r.headers.getSetCookie?r.headers.getSetCookie():[r.headers.get('set-cookie')||''];
 return values.flatMap(v=>v.split(/,(?=__Host-)/)).map(x=>x.trim())
  .find(x=>x.startsWith(name+'='))?.split(';')[0]||'';
};
const makeMock=()=>{
 let tokenNonce=null, issuedToken=null, exchangeCount=0;
 const fetchImpl=async (url,opts={})=>{
  const u=String(url);
  if(u.endsWith('/.well-known/openid-configuration'))
   return Response.json({issuer:FEIDE_ISSUER,
    authorization_endpoint:FEIDE_ISSUER+'/oauth/authorization',
    token_endpoint:FEIDE_ISSUER+'/oauth/token',
    jwks_uri:FEIDE_ISSUER+'/openid/jwks',
    end_session_endpoint:FEIDE_ISSUER+'/openid/endsession'});
  if(u.endsWith('/openid/jwks'))return Response.json({keys:[jwk]});
  if(u.endsWith('/oauth/token')){
   assert.equal(opts.method,'POST');
   assert.match(opts.headers.Authorization,/^Basic /);
   const body=new URLSearchParams(opts.body);
   assert.equal(body.get('code_verifier')?.length,43);
   assert.equal(body.get('redirect_uri'),CALLBACK);
   assert.equal(body.get('grant_type'),'authorization_code');
   assert.equal(body.get('code'),'testing-code');
   exchangeCount++;
   issuedToken=signClaims({iss:FEIDE_ISSUER,aud:client,sub:'FEIDE_TEST_SUB',
     nonce:tokenNonce,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+600});
   return Response.json({id_token:issuedToken,access_token:'test-provider-access-token'});
  }
  throw Error('Unexpected mock endpoint');
 };
 return {fetchImpl,setNonce:n=>{tokenNonce=n;},getToken:()=>issuedToken,exchanges:()=>exchangeCount};
};

test('Preview-only fail closed, no credentials exposed by status',async()=>{
 assert.equal(configReady(env),true);
 assert.equal(configReady({...env,FEIDE_POC_ENABLED:'false'}),false);
 assert.equal(configReady({...env,FEIDE_POC_COOKIE_KEY:'bad'}),false);
 const h=createFeideOidcHandler({env,now:()=>now,fetchImpl:async()=>{throw Error('no');}});
 assert.equal((await h(new Request('https://www.skoleuka.no/api/feide-oidc/status'))).status,404);
 assert.equal((await h(new Request('https://deploy-preview-170--ukeplanen.netlify.app/api/feide-oidc/status'))).status,404);
 assert.equal((await h(req('start',{method:'POST'}))).status,405);
 const unavailable=await createFeideOidcHandler({env:{},now:()=>now})(req('status'));
 assert.deepEqual(await unavailable.json(),{ready:false,authenticated:false});
});

test('Encrypted HttpOnly cookie binds name, uses AEAD and rejects tampering and expiry',()=>{
 const enc=seal('testcookie',{createdAt:now,state:'1'},cookieKey);
 assert.equal(unseal('testcookie',enc,cookieKey,now).state,'1');
 assert.equal(unseal('othercookie',enc,cookieKey,now),null);
 assert.equal(unseal('testcookie',enc,cookieKey,now+11*60_000),null);
 assert.equal(unseal('testcookie',enc.slice(0,-1)+'Z',cookieKey,now),null);
});

test('RS256 Feide ID token must have verified issuer, audience, nonce, timestamps and signature',async()=>{
 const fetchImpl=async()=>Response.json({keys:[jwk]});
 const claims={iss:FEIDE_ISSUER,aud:client,sub:'test-sub',nonce:'123',
   iat:Math.floor(now/1000),exp:Math.floor(now/1000)+600};
 const valid=signClaims(claims);
 assert.equal((await validateFeideIdToken(valid,{jwksUrl:FEIDE_ISSUER+'/openid/jwks',clientId:client,
   nonce:'123',fetchImpl,now})).subject,'test-sub');
 const verify=p=>validateFeideIdToken(signClaims({...claims,...p}),{
   jwksUrl:FEIDE_ISSUER+'/openid/jwks',clientId:client,nonce:'123',fetchImpl,now});
 await assert.rejects(verify({iss:'https://evil.example'}));
 await assert.rejects(verify({aud:'different-client'}));
 await assert.rejects(verify({nonce:'wrong'}));
 await assert.rejects(verify({exp:Math.floor(now/1000)-500}));
 const modified=valid.slice(0,-2)+'AA';
 await assert.rejects(validateFeideIdToken(modified,{jwksUrl:FEIDE_ISSUER+'/openid/jwks',
   clientId:client,nonce:'123',fetchImpl,now}));
});

test('Full server flow: PKCE state, code exchange, verify ID token, local revoke, Feide logout return',async()=>{
 const mock=makeMock();
 const handler=createFeideOidcHandler({env,fetchImpl:mock.fetchImpl,now:()=>now});
 const start=await handler(req('start'));
 assert.equal(start.status,303);
 const auth=new URL(start.headers.get('location'));
 assert.equal(auth.origin,FEIDE_ISSUER);
 assert.equal(auth.searchParams.get('response_type'),'code');
 assert.equal(auth.searchParams.get('scope'),'openid');
 assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
 assert.equal(auth.searchParams.get('redirect_uri'),CALLBACK);
 const flowCookie=cookieOf(start,'__Host-skoleuka-feide-flow');
 assert.ok(flowCookie.includes('='));
 assert.match(start.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Lax/);
 const flow=unseal('__Host-skoleuka-feide-flow',flowCookie.split('=')[1],cookieKey,now);
 assert.equal(flow.state,auth.searchParams.get('state'));
 mock.setNonce(flow.nonce);
 const invalid=await handler(req('callback?code=testing-code&state=bad',{headers:{Cookie:flowCookie}}));
 assert.equal(new URL(invalid.headers.get('Location')).searchParams.get('result'),'login-invalid');
 assert.equal(mock.exchanges(),0);
 const callback=await handler(req('callback?code=testing-code&state='+encodeURIComponent(flow.state),{
  headers:{Cookie:flowCookie}
 }));
 assert.equal(callback.status,303);
 assert.equal(new URL(callback.headers.get('location')).searchParams.get('result'),'signed-in');
 assert.equal(mock.exchanges(),1);
 const sessionCookie=cookieOf(callback,'__Host-skoleuka-feide-session');
 assert.ok(sessionCookie);
 const sessionRaw=unseal('__Host-skoleuka-feide-session',sessionCookie.split('=')[1],cookieKey,now,15*60_000);
 assert.equal(sessionRaw.sub,'FEIDE_TEST_SUB');
 assert.equal(sessionRaw.idToken,mock.getToken());
 const status=await handler(req('status',{headers:{Cookie:sessionCookie}}));
 assert.deepEqual(await status.json(),{ready:true,authenticated:true});
 const logout=await handler(req('logout',{headers:{Cookie:sessionCookie}}));
 const feideUrl=new URL(logout.headers.get('location'));
 assert.equal(feideUrl.pathname,'/openid/endsession');
 assert.equal(feideUrl.searchParams.get('post_logout_redirect_uri'),COMPLETE);
 assert.equal(feideUrl.searchParams.get('id_token_hint'),mock.getToken());
 const logoutCookie=cookieOf(logout,'__Host-skoleuka-feide-logout');
 assert.ok(logoutCookie);
 assert.ok(logout.headers.getSetCookie().some(v=>v.startsWith('__Host-skoleuka-feide-session=;')&&v.includes('Max-Age=0')));
 const completed=await handler(req('complete?state='+encodeURIComponent(feideUrl.searchParams.get('state')),
  {headers:{Cookie:logoutCookie}}));
 assert.equal(new URL(completed.headers.get('location')).searchParams.get('result'),'logged-out');
 const noSession=await handler(req('status'));
 assert.equal((await noSession.json()).authenticated,false);
 const invalidComplete=await handler(req('complete?state=wrong',{headers:{Cookie:logoutCookie}}));
 assert.equal(new URL(invalidComplete.headers.get('location')).searchParams.get('result'),'logout-unconfirmed');
});

test('Feide callback refuses missing encrypted flow and performs no token exchange',async()=>{
 const mock=makeMock();
 const h=createFeideOidcHandler({env,fetchImpl:mock.fetchImpl,now:()=>now});
 const r=await h(req('callback?state=anything&code=testing-code'));
 assert.equal(new URL(r.headers.get('location')).searchParams.get('result'),'login-invalid');
 assert.equal(mock.exchanges(),0);
});
