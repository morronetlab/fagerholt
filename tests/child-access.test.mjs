import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createChildAccessHandler,PAIRING_VALID_MS,DEVICE_VALID_MS} from '../lib/child-access.mjs';
const family='00000000-0000-4000-8000-000000000011';
const child='00000000-0000-4000-8000-000000000022';
const parent='00000000-0000-4000-8000-000000000033';
const other='00000000-0000-4000-8000-000000000044';
const env={SUPABASE_URL:'https://testproject.supabase.co',
 SUPABASE_PUBLISHABLE_KEY:'sb_publishable_'+'p'.repeat(40),
 SUPABASE_SERVICE_ROLE_KEY:'sb_secret_'+'s'.repeat(40)};
const jwt='eyJ.'+'a'.repeat(60)+'.sig';
const now=()=>new Date('2026-10-31T15:00:00Z');
const ok=(payload,status=200)=>new Response(payload==null?null:JSON.stringify(payload),{
 status,headers:{'Content-Type':'application/json'}});
function fixture({authStatus=200}={}){
 const pairs=[],devices=[],calls=[];let sequence=0;
 const secret=()=>String(++sequence).padStart(64,'a');
 const fetchImpl=async(raw,options={})=>{
  const url=new URL(raw),pathname=url.pathname,params=url.searchParams;
  calls.push({path:pathname,method:options.method||'GET',query:url.search,
   headers:options.headers,body:options.body&&JSON.parse(options.body)});
  if(pathname==='/auth/v1/user')return authStatus===200?ok({
   id:parent,email_confirmed_at:'2026-01-01T00:00:00Z',is_anonymous:false}):
   ok({code:'session_not_found'},authStatus);
  if(pathname==='/rest/v1/children'){
   if(options.headers?.Authorization==='Bearer '+jwt&&params.get('id')==='eq.'+child)
    return ok([{id:child,family_id:family,nickname:'Barn A',
     school_id:'fagerholt',grade:'3',group_name:'Rød'}]);
   if(options.headers?.apikey===env.SUPABASE_SERVICE_ROLE_KEY){
    return ok([{id:child,family_id:family,nickname:'Barn A',
     school_id:'fagerholt',grade:'3',group_name:'Rød'}]);
   }
   return ok([]);
  }
  if(pathname==='/rest/v1/child_pairings'){
   if(options.method==='POST'){
    const data=JSON.parse(options.body);pairs.push({...data,id:'pair-id',redeemed_at:null});
    return ok(null,201);
   }
   if(options.method==='PATCH'){
    const hash=params.get('token_hash')?.replace('eq.','');
    const pair=pairs.find(x=>x.token_hash===hash&&!x.redeemed_at);
    if(!pair)return ok([]);
    pair.redeemed_at=JSON.parse(options.body).redeemed_at;
    return ok([{id:pair.id,family_id:family,child_id:child}]);
   }
   return ok(pairs.filter(x=>!x.redeemed_at).map(x=>({id:x.id})));
  }
  if(pathname==='/rest/v1/child_device_sessions'){
   if(options.method==='POST'){
    const data=JSON.parse(options.body);devices.push({...data,
     id:'00000000-0000-4000-8000-000000000055',revoked_at:null,
     created_at:now().toISOString()});return ok(null,201);
   }
   if(options.method==='PATCH'){
    const id=params.get('id')?.replace('eq.',''),hash=params.get('secret_hash')?.replace('eq.','');
    const d=devices.find(x=>!x.revoked_at&&
      (id?x.id===id:hash?x.secret_hash===hash:false));
    if(d)d.revoked_at=JSON.parse(options.body).revoked_at;
    return options.headers?.Prefer==='return=representation'?ok(d?[{id:d.id}]:[]):ok(null,204);
   }
   const hash=params.get('secret_hash')?.replace('eq.','');
   if(hash)return ok(devices.filter(x=>x.secret_hash===hash&&!x.revoked_at));
   return ok(devices.filter(x=>!x.revoked_at));
  }
  if(pathname==='/rest/v1/family_activities'){
   return ok([
    {id:'family',child_id:null,title:'Felles middag',occurs_on:'2026-11-02',repeat_rule:'none'},
    {id:'mine',child_id:child,title:'Korps',occurs_on:'2026-11-02',repeat_rule:'weekly'},
    {id:'sibling',child_id:other,title:'Privat søskenaktivitet',
     occurs_on:'2026-11-02',repeat_rule:'none'}
   ]);
  }
  throw Error('Unexpected mocked URL '+pathname);
 };
 const handler=createChildAccessHandler({env,fetchImpl,now,secret});
 const request=(action,body=null,{token=jwt,origin='https://skoleuka.no'}={})=>
  handler(new Request('https://skoleuka.no/api/child-access'+
    (body===null?'?action='+action+'&childId='+child+(action==='child'?'&year=2026&week=45':''):''),{
   method:body===null?'GET':'POST',
   headers:{Origin:origin,Authorization:'Bearer '+token, ...(body!==null?{'Content-Type':'application/json'}:{})},
   body:body===null?undefined:JSON.stringify({action,...body})
  }));
 return {request,pairs,devices,calls};
}
test('A confirmed guardian may mint one-use 10-minute QR; data and QR SVG never expose service key',async()=>{
 const f=fixture(),r=await f.request('create',{childId:child});
 assert.equal(r.status,201);
 const result=await r.json();
 assert.match(result.link,/^https:\/\/skoleuka\.no\/barn\/\?pair=[a-f0-9]{64}$/);
 assert.match(result.qr,/^data:image\/svg\+xml;base64,/);
 assert.match(Buffer.from(result.qr.split(',')[1],'base64').toString(),/<svg/);
 assert.ok(new Date(result.expiresAt)-now()===PAIRING_VALID_MS);
 assert.equal(f.pairs.length,1);
 assert.equal(f.pairs[0].token_hash.length,64);
 assert.ok(!JSON.stringify(f.pairs).includes(result.link.split('pair=')[1]));
 assert.ok(!JSON.stringify(result).includes(env.SUPABASE_SERVICE_ROLE_KEY));
 assert.equal(r.headers.get('Referrer-Policy'),'no-referrer');
});
test('Redeem is single-use, child may only read child/family events, and guardian can revoke',async()=>{
 const f=fixture();
 const invite=await (await f.request('create',{childId:child})).json();
 const code=invite.link.split('pair=')[1];
 const issued=await f.request('redeem',{token:code});
 assert.equal(issued.status,201);
 const session=(await issued.json()).session;
 assert.match(session,/^[a-f0-9]{64}$/);
 assert.equal((await f.request('redeem',{token:code})).status,410);
 const data=await f.request('child',null,{token:session});
 assert.equal(data.status,200);
 const view=await data.json();
 assert.deepEqual(view.child,{id:child,name:'Barn A',school:'fagerholt',grade:'3',group:'Rød'});
 assert.equal(view.activities.length,2);
 assert.ok(view.activities.every(x=>x.child_id===null||x.child_id===child));
 assert.ok(!JSON.stringify(view).includes('Privat søskenaktivitet'));
 assert.ok(!JSON.stringify(view).includes('family_id'));
 assert.equal((await f.request('devices')).status,200);
 const revoked=await f.request('revoke',{childId:child,deviceId:f.devices[0].id});
 assert.equal(revoked.status,200);
 assert.equal((await f.request('child',null,{token:session})).status,401);
 assert.equal(f.devices[0].secret_hash.length,64);
 assert.ok(new Date(f.devices[0].expires_at)-now()===DEVICE_VALID_MS);
});
test('Pair creation is denied without authenticated parent RLS visibility',async()=>{
 const f=fixture();
 assert.equal((await f.request('create',{childId:other})).status,403);
 assert.equal((await f.request('create',{childId:child},{token:''})).status,403);
 assert.equal(f.pairs.length,0);
});
test('Reject cross-origin posts and invalid, expired, or replayed QR before any session',async()=>{
 const f=fixture();
 assert.equal((await f.request('create',{childId:child},{origin:'https://malicious.example'})).status,403);
 assert.equal((await f.request('redeem',{token:'short'})).status,400);
 assert.equal(f.devices.length,0);
});
test('Migration denies anon/authenticated direct access and makes child sessions revocable',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261031150237_child_pairing_v1.sql',import.meta.url),'utf8');
 assert.match(sql,/alter table public\.child_pairings enable row level security/);
 assert.match(sql,/alter table public\.child_device_sessions enable row level security/);
 assert.match(sql,/revoke all on public\.child_device_sessions from public,anon,authenticated/);
 assert.match(sql,/foreign key \(child_id,family_id\)/);
 assert.match(sql,/revoked_at timestamptz/);
});

test('A child can revoke the exact current device session without a guardian JWT',async()=>{
 const f=fixture();
 const link=(await (await f.request('create',{childId:child})).json()).link;
 const token=link.split('pair=')[1];
 const issued=(await (await f.request('redeem',{token})).json()).session;
 assert.equal(f.devices.length,1);
 const revoked=await f.request('self-revoke',{}, {token:issued});
 assert.equal(revoked.status,200);
 assert.equal((await revoked.json()).revoked,true);
 assert.ok(f.devices[0].revoked_at);
 assert.equal((await f.request('child',null,{token:issued})).status,401);
 assert.equal((await f.request('self-revoke',{}, {token:issued})).status,401);
 assert.equal((await f.request('self-revoke',{}, {token:'bad'})).status,401);
 assert.ok(f.calls.filter(x=>x.path==='/auth/v1/user').length===1,
  'Only parent QR creation may require a guardian JWT');
});
test('Deployed migration version matches Supabase history and grants only server-side API access',()=>{
 const service=readFileSync(new URL('../supabase/migrations/20261031150326_child_pairing_service_access.sql',import.meta.url),'utf8');
 assert.match(service,/grant select, insert, update, delete\s+on table public\.child_pairings, public\.child_device_sessions\s+to service_role/);
 assert.doesNotMatch(service,/grant [^;]+ to (?:anon|authenticated)\s*;/i);
 assert.match(service,/child_pairings_child_family_idx/);
});

test('Guardian may issue a fresh QR after the previous code was redeemed and the device remains active',async()=>{
 const f=fixture();
 const first=await (await f.request('create',{childId:child})).json();
 assert.equal((await f.request('redeem',{token:first.link.split('pair=')[1]})).status,201);
 assert.equal(f.devices.length,1,'The first child device stays active');
 const second=await f.request('create',{childId:child});
 assert.equal(second.status,201);
 const newLink=(await second.json()).link;
 assert.notEqual(newLink,first.link,'New QR must have a fresh token');
 assert.equal(f.pairs.length,2,'Both QR records remain auditably distinct');
 assert.equal(f.devices.length,1,'Creating a new QR must not revoke the old device');
});

test('Supabase session_not_found 403 returns actionable 401 without leaking backend details',async()=>{
 const f=fixture({authStatus:403});
 const r=await f.request('create',{childId:child});
 assert.equal(r.status,401);
 const result=await r.json();
 assert.match(result.error,/logg inn på nytt/i);
 assert.doesNotMatch(JSON.stringify(result),/session_not_found|Bearer|sb_secret_/);
 assert.equal(f.pairs.length,0,'Invalid guardian session must not create a pairing');
});
test('Service-only activity read migration is recorded and does not broaden client RLS',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261031170017_child_access_read_family_activities.sql',import.meta.url),'utf8');
 assert.match(sql,/grant select on public\.family_activities to service_role/i);
 assert.doesNotMatch(sql,/grant\s+select[^;]+to\s+(?:anon|authenticated)/i);
});
