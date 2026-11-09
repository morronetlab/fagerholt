import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminReportsHandler,verifyFeedbackAdmin} from '../lib/admin-reports-core.mjs';

const admin='11111111-1111-4111-8111-111111111111';
const outsider='22222222-2222-4222-8222-222222222222';
const reportId='33333333-3333-4333-8333-333333333333';
const env={FEEDBACK_ADMIN_USER_ID:admin,SUPABASE_URL:'https://testprojectabc.supabase.co/',
 SUPABASE_PUBLISHABLE_KEY:'sb_publishable_not_a_real_but_long_test_key'};
const today=()=>Date.parse('2026-11-09T12:00:00Z');
const api='/api/admin-reports';
const request=(path=api,options={})=>new Request('https://www.skoleuka.no'+path,options);
const authorized={authorization:'Bearer valid-jwt'};
const sample={id:reportId,submittedAt:'2026-11-08T09:30:00Z',kind:'wrong_interpretation',
 school:'fagerholt',grade:'3',week:45,year:2026,details:'Manglende norsklekse',
 sourceText:'Les side 40',pdf:null,sourcePage:null};
const mockStore=()=>{
 const map=new Map([['reports/2026-11-08/'+reportId+'.json',sample]]);
 return {map,
  list:async({prefix})=>({blobs:[...map.keys()].filter(x=>x.startsWith(prefix)).map(key=>({key}))}),
  get:async key=>map.get(key)||null,
  setJSON:async(key,data)=>{map.set(key,data);return{modified:true}}
 };
};
const json=async res=>({status:res.status,data:await res.json()});
test('JWT must be checked with Supabase Auth, not trusted browser claims',async()=>{
 const req=request(api,{headers:authorized});
 const legitimate=await verifyFeedbackAdmin(req,{env,fetchImpl:async(url,init)=>{
  assert.equal(url,'https://testprojectabc.supabase.co/auth/v1/user');
  assert.equal(init.headers.Authorization,'Bearer valid-jwt');
  return new Response(JSON.stringify({id:admin}),{status:200});
 }});
 assert.equal(legitimate.ok,true);
 const wrong=await verifyFeedbackAdmin(req,{env,fetchImpl:async()=>
  new Response(JSON.stringify({id:outsider}),{status:200})});
 assert.deepEqual(wrong,{ok:false,status:403});
 const unauthorized=await verifyFeedbackAdmin(request(),{env});
 assert.deepEqual(unauthorized,{ok:false,status:401});
 const revoked=await verifyFeedbackAdmin(req,{env,fetchImpl:async()=>
  new Response('{}',{status:401})});
 assert.deepEqual(revoked,{ok:false,status:401});
 assert.deepEqual(await verifyFeedbackAdmin(req,{env:{},fetchImpl:async()=>{throw Error('unexpected')}}),
  {ok:false,status:503});
});
test('Only approved admins may read reports; no secret or account details are returned',async()=>{
 const store=mockStore(),verify=async request=>({
  ok:request.headers.get('authorization')==='Bearer valid-jwt',
  status:request.headers.has('authorization')?403:401
 });
 const handler=createAdminReportsHandler({storeFactory:async()=>store,now:today,env,verify});
 assert.equal((await handler(request())).status,401);
 assert.equal((await handler(request(api,{headers:{authorization:'Bearer outsider'}}))).status,403);
 const result=await json(await handler(request(api+'?days=7',{headers:authorized})));
 assert.equal(result.status,200);
 assert.equal(result.data.reports.length,1);
 assert.equal(result.data.reports[0].reviewStatus,'new');
 assert.equal(result.data.reports[0].details,sample.details);
 assert.doesNotMatch(JSON.stringify(result.data),/valid-jwt|sb_publishable|FEEDBACK_ADMIN_TOKEN/);
 assert.match((await handler(request(api,{headers:authorized}))).headers.get('cache-control'),/no-store/);
});
test('Review state is stored separately; source report remains immutable',async()=>{
 const store=mockStore();
 const handler=createAdminReportsHandler({storeFactory:async()=>store,now:today,env,
  verify:async()=>({ok:true,status:200})});
 const patch=(value,headers={})=>request(api,{method:'PATCH',headers:{
  ...authorized,'Content-Type':'application/json',origin:'https://www.skoleuka.no',...headers
 },body:JSON.stringify(value)});
 const value={date:'2026-11-08',id:reportId,status:'in_progress'};
 let result=await json(await handler(patch(value)));
 assert.equal(result.status,200);assert.equal(result.data.status,'in_progress');
 assert.deepEqual(store.map.get('reports/2026-11-08/'+reportId+'.json'),sample);
 result=await json(await handler(request(api,{headers:authorized})));
 assert.equal(result.data.reports[0].reviewStatus,'in_progress');
 assert.equal((await handler(patch({...value,status:'nonexistent'}))).status,400);
 assert.equal((await handler(patch({...value,id:outsider}))).status,404);
 assert.equal((await handler(patch({...value,date:'2026-99-99'}))).status,400);
 assert.equal((await handler(patch(value,{origin:'https://attacker.example'}))).status,403);
 assert.equal((await handler(request(api+'?days=100',{headers:authorized}))).status,400);
 assert.equal((await handler(request(api,{method:'DELETE',headers:authorized}))).status,405);
});
test('Admin authorization errors never open private storage',async()=>{
 let called=false;
 const handler=createAdminReportsHandler({env,storeFactory:async()=>{called=true;return mockStore()},
  verify:async()=>({ok:false,status:403})});
 const response=await handler(request(api,{headers:authorized}));
 assert.equal(response.status,403);assert.equal(called,false);
});
