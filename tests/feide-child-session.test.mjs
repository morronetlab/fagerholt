import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createChildAccessHandler} from '../lib/child-access.mjs';
import {resolveFeideChildContext,feidePilotRequest} from '../lib/feide-child-session.mjs';
import {POC_ORIGIN,seal} from '../lib/feide-oidc.mjs';
import {subjectDigest} from '../lib/feide-child-link.mjs';
import {taskFingerprint} from '../public/shared/task-fingerprint.mjs';
const now=()=>new Date('2026-11-18T10:30:00Z');
const childId=randomUUID(),familyId=randomUUID(),otherChild=randomUUID();
const key=randomBytes(32);
const env={CONTEXT:'deploy-preview',FEIDE_POC_ENABLED:'true',
 FEIDE_POC_CLIENT_ID:randomUUID(),FEIDE_POC_CLIENT_SECRET:'SAFE_SYNTHETIC_CLIENT_SECRET',
 FEIDE_POC_COOKIE_KEY:key.toString('base64url'),
 SUPABASE_URL:'https://qxejliyfgfeigvxsqupg.supabase.co',
 SUPABASE_SERVICE_ROLE_KEY:'sb_secret_'+'x'.repeat(40),
 SUPABASE_PUBLISHABLE_KEY:'sb_publishable_'+'y'.repeat(40)};
const subject='feide-only-test-subject';
const cookie='__Host-skoleuka-feide-session='+seal('__Host-skoleuka-feide-session',{
  createdAt:now().getTime(),idToken:'synthetic-previously-verified-id-token',
  sub:subject,exp:Math.floor(now().getTime()/1000)+600},key);
const child={id:childId,family_id:familyId,nickname:'Barn',
 school_id:'fagerholt',grade:'3',group_name:'Rød'};
const task={text:'Les 10 minutter',subject:'Norsk',group:'Rød',dueDay:'Torsdag'};
const schoolPlan={year:2026,week:47,grade:'3',schoolId:'fagerholt',
  parsedFromPdf:true,aiStatus:'ready',status:'ready',homework:[task],days:{}};
const progressKey=taskFingerprint({school:child.school_id,grade:'3',year:2026,week:47,task});
const ok=(data,status=200)=>Response.json(data,{status});
function fixture(){
 let linked=true;let records=[],calls=[], qrSessions=0;
 const fetchImpl=async (url,opts={})=>{
  const u=new URL(url),p=u.searchParams;
  const path=u.pathname;
  calls.push({path,method:opts.method||'GET',query:u.search,body:opts.body?JSON.parse(opts.body):null});
  if(path==='/rest/v1/feide_child_links')
    return ok(linked&&p.get('subject_hash')==='eq.'+subjectDigest(subject,env)?
      [{id:randomUUID(),child_id:childId,family_id:familyId}]:[]);
  if(path==='/rest/v1/children')return ok(p.get('id')==='eq.'+childId&&
    p.get('family_id')==='eq.'+familyId?[child]:[]);
  if(path==='/rest/v1/child_device_sessions'){qrSessions++;return ok([]);}
  if(path==='/rest/v1/family_activities')return ok([
    {id:'shared',child_id:null,title:'Felles aktivitet',occurs_on:'2026-11-18',repeat_rule:'none'},
    {id:'own',child_id:childId,title:'Min aktivitet',occurs_on:'2026-11-18',repeat_rule:'none'},
    {id:'sibling',child_id:otherChild,title:'Hemmelig søskenaktivitet',occurs_on:'2026-11-18',repeat_rule:'none'}
  ]);
  if(path==='/rest/v1/homework_progress'){
    if(opts.method==='POST'){
      const d=JSON.parse(opts.body);
      assert.equal(d.family_id,familyId);assert.equal(d.child_id,childId);
      assert.equal(d.updated_by_device,null,'Feide must not mint or impersonate QR device');
      records=[{task_key:d.taskKey||d.task_key,completed:d.completed}];
      return ok([{task_key:d.task_key,completed:d.completed}],201);
    }
    return ok(records);
  }
  if(path==='/rest/v1/packing_progress')return ok([]);
  if(path==='/api/plan')return ok(schoolPlan);
  throw Error('Unexpected mocked backend path '+path);
 };
 const handler=createChildAccessHandler({env,fetchImpl,now,
   feideContextResolver:resolveFeideChildContext});
 function request(action,{method='GET',body=null,includeCookie=true,origin=POC_ORIGIN,auth=null,host=POC_ORIGIN}={}){
  const q=new URLSearchParams({action,year:'2026',week:'47'});
  const url=new URL('/api/child-access?'+q,host);
  return handler(new Request(url,{method,headers:{
   ...(includeCookie?{Cookie:cookie}:{}),
   ...(origin?{Origin:origin}:{}),
   ...(auth?{Authorization:auth}:{}),
   ...(method==='POST'?{'Content-Type':'application/json'}:{})
  },body:method==='POST'?JSON.stringify({action,...body}):undefined}));
 }
 return {request,calls,setLinked:x=>linked=x,getQrSessions:()=>qrSessions};
}
test('Feide cookie grants only approved, server-linked child, no sibling or family identifiers',async()=>{
 const f=fixture();
 const r=await f.request('child');assert.equal(r.status,200);
 const j=await r.json();
 assert.equal(j.authMethod,'feide');
 assert.deepEqual(j.child,{id:childId,name:'Barn',school:'fagerholt',grade:'3',group:'Rød'});
 assert.equal(j.activities.length,2);
 assert.ok(!JSON.stringify(j).includes('Hemmelig søskenaktivitet'));
 assert.ok(!JSON.stringify(j).includes(familyId));
 assert.equal(f.getQrSessions(),0,'Feide must not consume a QR device session');
 const forbidden=await f.request('devices');
 assert.equal(forbidden.status,403,'Feide cookie cannot access guardian device admin');
});
test('Feide may use existing server-validated homework progress, without a device credential',async()=>{
 const f=fixture();
 const before=await f.request('progress');assert.equal(before.status,200);
 const saved=await f.request('set-progress',{method:'POST',
   body:{year:2026,week:47,taskKey:progressKey,completed:true}});
 assert.equal(saved.status,200);
 assert.deepEqual(await saved.json(),{key:progressKey,completed:true});
 const again=await f.request('progress');
 assert.equal((await again.json()).progress[0].completed,true);
 assert.equal(f.getQrSessions(),0);
});
test('Revoking the parent-approved Feide link immediately removes ALL data access',async()=>{
 const f=fixture();
 assert.equal((await f.request('child')).status,200);
 f.setLinked(false);
 for(const action of ['child','progress','packing'])
  assert.equal((await f.request(action)).status,401,action);
 assert.equal((await f.request('set-progress',{method:'POST',body:{
  year:2026,week:47,taskKey:progressKey,completed:true}})).status,401);
});
test('Feide cannot use QR-device privileges, other hosts, unexpected origins or expired cookies',async()=>{
 const f=fixture();
 assert.equal((await f.request('child',{auth:'Bearer '+'f'.repeat(64)})).status,401);
 assert.equal((await f.request('child',{includeCookie:false})).status,401);
 assert.equal((await f.request('child',{host:'https://deploy-preview-170--ukeplanen.netlify.app',origin:null})).status,401);
 assert.equal((await f.request('set-progress',{method:'POST',origin:'https://evil.example',
   body:{year:2026,week:47,taskKey:progressKey,completed:true}})).status,403);
 assert.equal(feidePilotRequest(new Request(POC_ORIGIN+'/api/child-access',{
   method:'POST',headers:{Origin:POC_ORIGIN,'Content-Type':'application/json'}}),env,'self-revoke'),false);
 assert.equal(feidePilotRequest(new Request(POC_ORIGIN+'/api/child-access'),{
  ...env,CONTEXT:'production'},'child'),false,'Feide preview cannot be activated under production context');

 const stale=seal('__Host-skoleuka-feide-session',{
   createdAt:now().getTime()-20*60_000,idToken:'verified',sub:subject,
   exp:Math.floor(now().getTime()/1000)+600},key);
 const h=createChildAccessHandler({env,fetchImpl:async()=>{throw Error('must not fetch');},
   now,feideContextResolver:resolveFeideChildContext});
 const bad=await h(new Request(POC_ORIGIN+'/api/child-access?action=child',{
   headers:{Cookie:'__Host-skoleuka-feide-session='+stale}}));
 assert.equal(bad.status,401);
});
test('The real child app has separate Feide and QR logout controls only in preview',()=>{
 const source=readFileSync(new URL('../public/barn/child.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/barn/index.html',import.meta.url),'utf8');
 const oidc=readFileSync(new URL('../lib/feide-oidc.mjs',import.meta.url),'utf8');
 assert.match(source,/state\.authMode==='feide'/);
 assert.match(source,/\/api\/feide-oidc\/start\?return=child/);
 assert.match(source,/\/api\/feide-oidc\/logout\?return=child/);
 assert.match(html,/id="child-feide-login"/);
 assert.match(html,/id="child-feide-logout"/);
 assert.match(oidc,/id_token_hint/);
 assert.match(oidc,/post_logout_redirect_uri/);
});
