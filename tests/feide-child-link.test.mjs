import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createFeideLinkHandler,subjectDigest} from '../lib/feide-child-link.mjs';
import {POC_ORIGIN,seal} from '../lib/feide-oidc.mjs';

const nowMs=Date.parse('2026-11-18T10:00:00Z');
const cookieKey=randomBytes(32);
const owner=randomUUID(),stranger=randomUUID(),childId=randomUUID(),familyId=randomUUID();
const tokenA='A'.repeat(48), tokenB='B'.repeat(48), invite='c'.repeat(64),pin='283941';
const env={CONTEXT:'deploy-preview',FEIDE_POC_ENABLED:'true',FEIDE_POC_CLIENT_ID:randomUUID(),
 FEIDE_POC_CLIENT_SECRET:'TEST_ONLY_NOT_A_REAL_SECRET',
 FEIDE_POC_COOKIE_KEY:cookieKey.toString('base64url'),SUPABASE_URL:'https://qxejliyfgfeigvxsqupg.supabase.co',
 SUPABASE_SERVICE_ROLE_KEY:'sb_secret_'+'x'.repeat(40),
 SUPABASE_PUBLISHABLE_KEY:'sb_publishable_'+'y'.repeat(40)};
const feideCookie='__Host-skoleuka-feide-session='+seal('__Host-skoleuka-feide-session',
  {createdAt:nowMs,idToken:'already-verified-on-server',sub:'subject-from-feide',exp:Math.floor(nowMs/1000)+600},cookieKey);
const req=(action,{method='GET',body,guardian=tokenA,cookie,origin=POC_ORIGIN,child=childId}={})=>{
 const query=new URLSearchParams({action});
 if(method==='GET'&&['status'].includes(action))query.set('childId',child);
 return new Request(POC_ORIGIN+'/api/feide-child-link?'+query,{
  method,
  headers:{...(guardian?{Authorization:'Bearer '+guardian}:{}),
   ...(cookie?{Cookie:cookie}:{}),
   ...(method==='POST'?{Origin:origin,'Content-Type':'application/json'}:{})},
  body:method==='POST'?JSON.stringify({...body,childId:child}):undefined
 });
};

function fakeDb(){
 const requests=[],links=[], calls=[];
 const json=(data,status=200)=>Response.json(data,{status});
 const fetchImpl=async (url,opts={})=>{
  const u=new URL(url),p=u.searchParams;
  calls.push({path:u.pathname,method:opts.method||'GET',bearer:opts.headers?.Authorization||null});
  if(u.pathname==='/auth/v1/user'){
   if(opts.headers?.Authorization==='Bearer '+tokenA)
    return json({id:owner,email_confirmed_at:'2026-11-01T00:00:00Z',is_anonymous:false});
   if(opts.headers?.Authorization==='Bearer '+tokenB)
    return json({id:stranger,email_confirmed_at:'2026-11-01T00:00:00Z',is_anonymous:false});
   return json({},401);
  }
  if(u.pathname==='/rest/v1/children')
   return json(opts.headers?.Authorization==='Bearer '+tokenA &&
    p.get('id')==='eq.'+childId?[{id:childId,family_id:familyId}]:[]);
  if(u.pathname==='/rest/v1/feide_link_requests'){
   const body=opts.body?JSON.parse(opts.body):{};
   if(opts.method==='POST'){
    const row={id:randomUUID(),created_at:new Date(nowMs).toISOString(),
     failed_attempts:0,approved_at:null,subject_hash:null,confirmation_hash:null,...body};
    requests.push(row);return json([row],201);
   }
   let found=requests.filter(r=>
    (!p.has('id')||p.get('id')==='eq.'+r.id)&&
    (!p.has('token_hash')||p.get('token_hash')==='eq.'+r.token_hash)&&
    (!p.has('child_id')||p.get('child_id')==='eq.'+r.child_id)&&
    (!p.has('family_id')||p.get('family_id')==='eq.'+r.family_id)&&
    (!p.has('created_by')||p.get('created_by')==='eq.'+r.created_by)&&
    (!p.has('expires_at')||p.get('expires_at')==='gt.'+r.expires_at||
      (p.get('expires_at')?.startsWith('gt.')&&r.expires_at>p.get('expires_at').slice(3)))&&
    (!p.has('subject_hash')||r.subject_hash===null)&&
    (!p.has('approved_at')||r.approved_at===null)&&
    (!p.has('failed_attempts')||p.get('failed_attempts')==='eq.'+r.failed_attempts)
   );
   if(opts.method==='PATCH'){
    found.forEach(r=>Object.assign(r,body));
    return json(opts.headers?.Prefer==='return=minimal'?[]:found);
   }
   return json(found.slice(0,Number(p.get('limit')||100)));
  }
  if(u.pathname==='/rest/v1/feide_child_links'){
   const body=opts.body?JSON.parse(opts.body):{};
   if(opts.method==='POST'){
    if(links.some(l=>!l.revoked_at&&(l.child_id===body.child_id||l.subject_hash===body.subject_hash)))
      return json({error:'unique_violation'},409);
    const row={id:randomUUID(),revoked_at:null,...body};links.push(row);return json([row],201);
   }
   const found=links.filter(l=>
     (!p.has('subject_hash')||p.get('subject_hash')==='eq.'+l.subject_hash)&&
     (!p.has('child_id')||p.get('child_id')==='eq.'+l.child_id)&&
     (!p.has('family_id')||p.get('family_id')==='eq.'+l.family_id)&&
     (!p.has('revoked_at')||l.revoked_at===null));
   if(opts.method==='PATCH'){found.forEach(r=>Object.assign(r,body));return json([]);}
   return json(found);
  }
  return json({error:'unhandled endpoint'},404);
 };
 return {fetchImpl,requests,links,calls};
}

test('PR2 allows only the configured project on exact preview #170 and denies cross-origin requests',async()=>{
 const db=fakeDb(),h=createFeideLinkHandler({env,fetchImpl:db.fetchImpl,now:()=>new Date(nowMs)});
 assert.equal((await h(new Request('https://www.skoleuka.no/api/feide-child-link?action=create',{method:'POST'}))).status,404);
 const misconfigured=createFeideLinkHandler({
   env:{...env,SUPABASE_URL:'https://wrongproject.supabase.co'},
   fetchImpl:db.fetchImpl,now:()=>new Date(nowMs)
 });
 const blocked=await misconfigured(req('create',{method:'POST',body:{}}));
 assert.equal(blocked.status,503);
 assert.equal(db.calls.length,0);
 assert.equal((await h(new Request('https://deploy-preview-169--ukeplanen.netlify.app/api/feide-child-link?action=me'))).status,404);
 assert.equal((await h(req('create',{method:'POST',body:{},origin:'https://attacker.example'}))).status,403);
 assert.equal((await h(req('claim',{method:'POST',body:{token:invite}}))).status,401);
 assert.equal(db.calls.length,0);
});

test('Only guardian with fresh Supabase JWT and children RLS can initiate linking',async()=>{
 const db=fakeDb();let issued=0;const h=createFeideLinkHandler({env,fetchImpl:db.fetchImpl,now:()=>new Date(nowMs),secret:()=>issued++===0?invite:randomBytes(32).toString('hex')});
 const outsider=await h(req('create',{method:'POST',guardian:tokenB,body:{}}));
 assert.equal(outsider.status,403);
 const created=await h(req('create',{method:'POST',body:{}}));
 assert.equal(created.status,201);
 const payload=await created.json();
 assert.match(payload.link,/^https:\/\/deploy-preview-171--ukeplanen\.netlify\.app\/barn\/feide\/koble\/\?token=[a-f0-9]{64}$/);
 assert.equal(db.requests[0].child_id,childId);
 assert.equal(db.requests[0].created_by,owner);
 assert.doesNotMatch(JSON.stringify(db.requests),/subject-from-feide|283941/);
 assert.equal((await h(req('create',{method:'POST',body:{}}))).status,201);
 assert.equal((await h(req('create',{method:'POST',body:{}}))).status,429);
});

test('Feide claim requires verified session and parent confirms code before link exists',async()=>{
 const db=fakeDb(),h=createFeideLinkHandler({
  env,fetchImpl:db.fetchImpl,now:()=>new Date(nowMs),secret:()=>invite,pin:()=>pin
 });
 const created=await (await h(req('create',{method:'POST',body:{}}))).json();
 const firstStatus=await (await h(req('status'))).json();
 assert.equal(firstStatus.linked,false);
 assert.equal(firstStatus.pending[0].status,'awaiting-feide');
 const claimed=await h(req('claim',{method:'POST',guardian:null,cookie:feideCookie,body:{token:invite}}));
 assert.equal(claimed.status,200);
 const code=await claimed.json();
 assert.equal(code.confirmationCode,pin);
 assert.equal((await h(req('claim',{method:'POST',guardian:null,cookie:feideCookie,body:{token:invite}}))).status,410);
 const status=await (await h(req('status'))).json();
 assert.equal(status.pending[0].status,'awaiting-parent-confirmation');
 assert.equal(status.linked,false);
 const incorrect=await h(req('approve',{method:'POST',body:{requestId:created.requestId,code:'111111'}}));
 assert.equal(incorrect.status,403);
 const outsider=await h(req('approve',{method:'POST',guardian:tokenB,
   body:{requestId:created.requestId,code:pin}}));
 assert.equal(outsider.status,403);
 const good=await h(req('approve',{method:'POST',body:{requestId:created.requestId,code:pin}}));
 assert.equal(good.status,200);
 assert.deepEqual(await good.json(),{linked:true});
 const after=await (await h(req('status'))).json();
 assert.equal(after.linked,true);
 assert.equal((await h(req('approve',{method:'POST',body:{requestId:created.requestId,code:pin}}))).status,409);
 const me=await (await h(req('me',{guardian:null,cookie:feideCookie}))).json();
 assert.deepEqual(me,{authenticated:true,linked:true});
 assert.equal(db.links.length,1);
 assert.notEqual(db.links[0].subject_hash,'subject-from-feide');
 assert.equal(db.links[0].subject_hash,subjectDigest('subject-from-feide',env));
 const revoked=await h(req('revoke',{method:'POST',body:{}}));
 assert.equal(revoked.status,200);
 assert.equal((await (await h(req('me',{guardian:null,cookie:feideCookie}))).json()).linked,false);
});

test('Link schema has RLS, server-only grants and uniqueness for active identities',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261118094522_feide_child_link_preview.sql',import.meta.url),'utf8');
 assert.match(sql,/alter table public\.feide_link_requests enable row level security;/);
 assert.match(sql,/alter table public\.feide_child_links enable row level security;/);
 assert.match(sql,/revoke all on public\.feide_link_requests,public\.feide_child_links from public,anon,authenticated;/);
 assert.match(sql,/unique index feide_child_links_subject_active_uidx/);
 assert.match(sql,/unique index feide_child_links_child_active_uidx/);
 assert.doesNotMatch(sql,/grant .* to (?:anon|authenticated)/i);
});
