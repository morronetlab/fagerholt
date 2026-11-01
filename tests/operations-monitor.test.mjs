import test from 'node:test';
import assert from 'node:assert/strict';
import {
 recordOperationsObservation,operationsSummary,operationKind,
 OPS_ALERT_THRESHOLD,nextOperationsSnapshot,authorizedOperations
} from '../lib/operations-monitor.mjs';
import {operationsTargets,runSchoolSourceProbes} from '../lib/school-source-probes.mjs';
import {createOperationsHealthHandler} from '../netlify/functions/operations-health.mjs';

const fixed=Date.parse('2026-11-02T10:00:00.000Z');
function store(){
 const m=new Map();
 return {
  m,async get(key){return m.get(key)||null;},
  async setJSON(key,value,{onlyIfNew=false}={}){
   if(onlyIfNew&&m.has(key))return {modified:false};
   m.set(key,value);return {modified:true};
  },
  async list({prefix,cursor}={}){
   assert.equal(cursor,undefined);
   return {blobs:[...m.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))};
  },
  async delete(key){m.delete(key);}
 };
}
const row=(kind,extra={})=>({
 school:'fagerholt',grade:'3',year:2026,week:45,kind,...extra
});
const env={OPS_DASHBOARD_TOKEN:'ops-test-secret-0123456789abcdef',
 SOURCE_ALERT_ENABLED:'true',SOURCE_ALERT_EMAIL:'drift@example.no',
 EMAIL_FROM:'Skoleuka <noreply@example.no>',
 RESEND_API_KEY:'re_1234567890123456789012345'};
test('Operational states are explicit, never guess PDF or AI outcomes',()=>{
 assert.equal(operationKind({status:'unpublished'}),'unpublished');
 assert.equal(operationKind({status:'error',errorCode:'school_page_failed'}),'source_error');
 assert.equal(operationKind({status:'error',errorCode:'pdf_download_failed'}),'pdf_download_failed');
 assert.equal(operationKind({status:'error',errorCode:'pdf_parse_failed'}),'pdf_parse_failed');
 assert.equal(operationKind({status:'partial',aiStatus:'failed'}),'ai_failed');
 assert.equal(operationKind({status:'partial',aiStatus:'processing'}),'ai_processing');
 assert.equal(operationKind({status:'ok',aiStatus:'ready'}),'ai_ready');
 assert.equal(operationKind({kind:'pdf_found'}),'pdf_found');
 const previous=null;
 assert.equal(nextOperationsSnapshot(previous,row('pdf_found'),fixed).consecutiveFailures,0);
 assert.equal(nextOperationsSnapshot(previous,row('source_error'),fixed).consecutiveFailures,1);
});
test('Repeated source failures alert once per episode; successes reset the counter',async()=>{
 const db=store(),messages=[];let stamp=fixed;
 const options={storeFactory:async()=>db,env,now:()=>stamp,
  notify:async payload=>{messages.push(payload);return 'sent';}};
 const record=async k=>recordOperationsObservation(row(k),options);
 assert.equal(await record('pdf_found'),true);
 let state=db.m.get('latest/fagerholt/3.json');
 assert.equal(state.status,'pdf_found');
 assert.equal(state.lastPdfFoundAt,new Date(fixed).toISOString());
 stamp+=60_000;await record('source_error');
 assert.equal(db.m.get('latest/fagerholt/3.json').consecutiveFailures,1);
 // High-frequency repeated requests do NOT count as separate failures.
 await record('source_error');
 assert.equal(db.m.get('latest/fagerholt/3.json').consecutiveFailures,1);
 for(let i=0;i<2;i++){stamp+=6*60_000;await record('source_error');}
 state=db.m.get('latest/fagerholt/3.json');
 assert.equal(state.consecutiveFailures,OPS_ALERT_THRESHOLD);
 assert.equal(messages.length,1);
 assert.match(messages[0].text,/Skole: fagerholt/);
 assert.doesNotMatch(messages[0].text,/student|parent|PDF text|access_token/i);
 stamp+=6*60_000;await record('source_error');
 assert.equal(messages.length,1);
 stamp+=6*60_000;await record('unpublished');
 assert.equal(db.m.get('latest/fagerholt/3.json').consecutiveFailures,0);
 for(let i=0;i<3;i++){stamp+=6*60_000;await record('ai_failed');}
 assert.equal(messages.length,2);
 assert.equal(db.m.get('latest/fagerholt/3.json').lastAIReadyAt,null);
 stamp+=6*60_000;await record('ai_ready');
 state=db.m.get('latest/fagerholt/3.json');
 assert.equal(state.consecutiveFailures,0);
 assert.equal(state.lastAIReadyAt,new Date(stamp).toISOString());
});
test('Monitoring stores no user or document payload and never blocks on blob failures',async()=>{
 const db=store();
 assert.equal(await recordOperationsObservation(row('pdf_found',{
  userEmail:'parent@example.no',userId:'guardian-a',profile:'child',
  pdf:'https://www.minskole.no/a.pdf',sourceText:'Sensitive class detail'
 }),{storeFactory:async()=>db,now:()=>fixed,env:{}}),true);
 const serialized=JSON.stringify([...db.m.values()]);
 assert.doesNotMatch(serialized,/parent@example.no|guardian-a|Sensitive class detail|a\.pdf/);
 assert.equal(await recordOperationsObservation(row('source_error'),{
  storeFactory:async()=>{throw Error('offline');},now:()=>fixed,env:{}}),false);
 assert.equal(await recordOperationsObservation(row('ready',{school:'bogus'}),{
  storeFactory:async()=>db,now:()=>fixed,env:{}}),false);
});
test('Failures from last school week do not contaminate the next week, and old checks are stale',async()=>{
 const start=nextOperationsSnapshot(null,row('source_error',{week:44}),fixed);
 const second=nextOperationsSnapshot(start,row('source_error',{week:45}),fixed+30_000);
 assert.ok(second,'New ISO week must not be hidden by five-minute dedupe');
 assert.equal(second.consecutiveFailures,1);
 assert.notEqual(start.lastFailureEpisodeAt,second.lastFailureEpisodeAt);
 const db=store();
 await db.setJSON('latest/fagerholt/3.json',start);
 const view=await operationsSummary({storeFactory:async()=>db,
  healthFactory:async()=>store(),now:()=>fixed+3*86400_000,env:{}});
 assert.equal(view.schools.find(s=>s.id==='fagerholt').status,'attention');
 assert.equal(view.schools.find(s=>s.id==='fagerholt').grades[0].stale,true);
});
test('Administrative health API is closed without a strong token and returns only aggregate data',async()=>{
 const db=store(),calendar=store();
 await recordOperationsObservation(row('pdf_found'),{
  storeFactory:async()=>db,env:{},now:()=>fixed
 });
 const summary=await operationsSummary({storeFactory:async()=>db,
  healthFactory:async()=>calendar,env,now:()=>fixed});
 assert.equal(summary.observedGrades,1);
 assert.ok(summary.totalSchools>=25);
 assert.equal(summary.schools.find(s=>s.id==='fagerholt').grades[0].status,'pdf_found');
 assert.equal(summary.schools.find(s=>s.id==='mosby').status,'not_monitored');
 assert.equal(summary.alertConfigured,true);
 assert.ok(!('users' in summary)&&!('families' in summary));
 const handler=createOperationsHealthHandler({env,summary:async()=>summary});
 const url='https://skoleuka.no/api/operations-health';
 assert.equal((await handler(new Request(url))).status,401);
 assert.equal((await handler(new Request(url,{headers:{authorization:'Bearer wrong'}}))).status,401);
 assert.equal((await handler(new Request(url,{method:'POST',headers:{
  authorization:'Bearer '+env.OPS_DASHBOARD_TOKEN}}))).status,405);
 const res=await handler(new Request(url,{headers:{authorization:'Bearer '+env.OPS_DASHBOARD_TOKEN}}));
 assert.equal(res.status,200);
 assert.match(res.headers.get('cache-control'),/no-store/);
 assert.match(res.headers.get('x-robots-tag'),/noindex/);
 const payload=await res.json();
 assert.equal(payload.observedGrades,1);
 assert.equal(authorizedOperations(new Request(url),{OPS_DASHBOARD_TOKEN:'short'}),false);
});
test('Proactive probe uses official public pages, current week and bounded configured targets',async()=>{
 assert.deepEqual(operationsTargets('fagerholt:3,unknown:2,fagerholt:3,fagerholt:7'),
  [{school:'fagerholt',grade:'3'},{school:'fagerholt',grade:'7'}]);
 assert.equal(operationsTargets('fagerholt:3,'.repeat(30)).length,1);
 const seen=[],events=[];
 const fetchImpl=async url=>{
  seen.push(url);
  const html=url.endsWith('/22636')?
   '<a href="/fagerholt/uke45.pdf">Uke 45 PDF</a>':
   '<a href="/fagerholt/uke44.pdf">Uke 44 PDF</a>';
  return {ok:true,url,headers:new Headers(),
   arrayBuffer:async()=>new TextEncoder().encode(html).buffer};
 };
 const result=await runSchoolSourceProbes({fetchImpl,
  env:{OPS_MONITOR_TARGETS:'fagerholt:3,fagerholt:7'},
  now:()=>new Date(fixed),
  record:async row=>{events.push(row);return true;}});
 assert.equal(result.length,2);
 assert.deepEqual(result.map(r=>r.kind),['pdf_found','unpublished']);
 assert.equal(result[0].week,45);
 assert.deepEqual(seen,[
  'https://www.minskole.no/fagerholt/seksjon/22636',
  'https://www.minskole.no/fagerholt/seksjon/22640']);
 assert.ok(events.every(event=>!('student' in event)&&!('pdf' in event)));
});
