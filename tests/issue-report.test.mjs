import test from 'node:test';
import assert from 'node:assert/strict';
import {validateIssueReport,createIssueReportHandler,createIssueReviewHandler,
 recordSourceAlert} from '../lib/issue-report-core.mjs';

const env={AI_JOB_SECRET:'0123456789abcdef0123456789abcdef',
 FEEDBACK_ADMIN_TOKEN:'admin-test-secret-0123456789abcdef'};
const pdf='https://www.minskole.no/DynamicContent/Documents/test-plan.pdf';
const sample={kind:'wrong_date',school:'fagerholt',grade:'3',year:2026,week:44,
 pdf,sourcePage:1,sourceText:'Fredag: Vaksine kl. 10',details:'Skolen sier at dette er på onsdag'};
const mockNow=()=>Date.parse('2026-10-30T12:00:00.000Z');
function store(){
 const map=new Map();
 return {map,get:async key=>map.get(key)||null,
  setJSON:async(key,value,{onlyIfNew=false}={})=>{
   if(onlyIfNew&&map.has(key))return {modified:false};
   map.set(key,value);return {modified:true};
  },
  list:async({prefix})=>({blobs:[...map.keys()].filter(key=>key.startsWith(prefix))
   .map(key=>({key}))})
 };
}
const req=(data=sample,ip='192.0.2.10',extra={})=>new Request('https://skoleuka.no/api/report-issue',{
 method:'POST',headers:{'content-type':'application/json',
  origin:'https://skoleuka.no','x-nf-client-connection-ip':ip,...extra},
 body:JSON.stringify(data)});
const asJSON=async response=>({code:response.status,body:await response.json()});

test('Strict inputs do not accept forged grade, PDF hosts, source page, type or private email',()=>{
 assert.deepEqual(validateIssueReport(sample),sample);
 for(const field of [
  {school:'invented'},{grade:'8'},{week:99},{year:1900},
  {kind:'admin'},{pdf:'https://example.com/a.pdf'},
  {pdf:'https://www.minskole.no.evil.test/a.pdf'},
  {pdf:'https://www.minskole.no/a.pdf?redirect=evil'},
  {sourcePage:-1},{sourcePage:999},{details:'Kontakt meg på parent@example.no'},
  {details:'Ring meg på 12345678'}
 ])assert.equal(validateIssueReport({...sample,...field}),null,JSON.stringify(field));
 assert.equal(validateIssueReport({...sample,kind:'missing_notice',details:'Kort'}),null);
 assert.ok(validateIssueReport({...sample,kind:'missing_notice',details:'Vaksinebeskjeden mangler helt'}));
 assert.equal(validateIssueReport({...sample,sourcePage:1,pdf:null}),null);
});
test('Only public school information is written; duplicate is idempotent and reviewer is locked',async()=>{
 const db=store(),handle=createIssueReportHandler({storeFactory:async()=>db,env,now:mockNow});
 const first=await asJSON(await handle(req()));
 assert.equal(first.code,201);assert.equal(first.body.status,'received');
 const repeat=await asJSON(await handle(req()));
 assert.equal(repeat.code,200);assert.equal(repeat.body.duplicate,true);
 const saved=[...db.map.entries()].filter(([key])=>key.startsWith('reports/'));
 assert.equal(saved.length,1);
 const record=saved[0][1];
 assert.equal(record.school,'fagerholt');
 assert.equal(record.grade,'3');
 assert.equal(record.pdf,pdf);
 assert.equal(record.sourcePage,1);
 assert.equal(record.kind,'wrong_date');
 assert.equal(record.details,sample.details);
 assert.ok(!('ip' in record)&&!('email' in record)&&!('user' in record));
 assert.doesNotMatch(JSON.stringify(record),/192\.0\.2\.10/);
 const reviewer=createIssueReviewHandler({storeFactory:async()=>db,env,now:mockNow});
 assert.equal((await reviewer(new Request('https://skoleuka.no/api/report-review'))).status,401);
 const review=await asJSON(await reviewer(new Request('https://skoleuka.no/api/report-review',{
  headers:{authorization:'Bearer '+env.FEEDBACK_ADMIN_TOKEN}})));
 assert.equal(review.code,200);
 assert.equal(review.body.reports.length,1);
 assert.equal(review.body.reports[0].id,record.id);
});
test('5/day limit is enforced per hashed address and origin is same-site',async()=>{
 const db=store(),handle=createIssueReportHandler({storeFactory:async()=>db,env,now:mockNow});
 for(let i=0;i<5;i++)assert.equal((await handle(req({...sample,details:'Avvik nummer '+i}))).status,201);
 assert.equal((await handle(req({...sample,details:'Et sjette avvik'}))).status,429);
 assert.equal((await handle(req({...sample,details:'Fra annen bruker'},'192.0.2.11'))).status,201);
 assert.equal((await handle(req(sample,'192.0.2.12',{origin:'https://malicious.example'}))).status,403);
 assert.equal((await handle(new Request('https://skoleuka.no/api/report-issue',{method:'GET'}))).status,405);
});
test('Unconfigured feedback is closed; invalid and too-long requests never write to storage',async()=>{
 const db=store(),handle=createIssueReportHandler({storeFactory:async()=>db,env,now:mockNow});
 assert.equal((await handle(req({...sample,grade:'99'}))).status,400);
 const large=req({...sample,details:'x'.repeat(3000)});
 assert.equal((await handle(large)).status,413);
 assert.equal([...db.map.keys()].length,0);
 assert.equal((await createIssueReportHandler({env:{},storeFactory:async()=>db})(req())).status,503);
});
test('Source anomalies persist as separate nonblocking diagnostics, with no source body or family data',async()=>{
 const db=store(),now=mockNow;
 const data={school:'fagerholt',grade:'7',year:2026,week:44,hash:'a'.repeat(64),
  pdf,audit:{status:'attention',sourceFacts:4,missing:2,unsupported:1}};
 assert.equal(await recordSourceAlert(data,{storeFactory:async()=>db,now}),true);
 assert.equal(await recordSourceAlert({...data,audit:{...data.audit,status:'ok'}},
  {storeFactory:async()=>db,now}),false);
 const review=createIssueReviewHandler({storeFactory:async()=>db,env,now});
 const res=await asJSON(await review(new Request('https://skoleuka.no/api/report-review?date=2026-10-30',
  {headers:{authorization:'Bearer '+env.FEEDBACK_ADMIN_TOKEN}})));
 assert.equal(res.code,200);assert.equal(res.body.sourceAlerts.length,1);
 assert.equal(res.body.sourceAlerts[0].missing,2);
 assert.equal(res.body.sourceAlerts[0].pdf,pdf);
 assert.equal(res.body.sourceAlerts[0].sourceQuote,undefined);
});
