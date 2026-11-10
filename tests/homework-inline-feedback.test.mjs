import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateIssueReport,createIssueReportHandler} from '../lib/issue-report-core.mjs';

const pdf='https://www.minskole.no/DynamicContent/Documents/uke-46.pdf';
const base={kind:'wrong_interpretation',school:'fagerholt',grade:'3',year:2026,
 week:46,pdf,sourcePage:2,sourceText:'Les 15 minutter hver dag',details:'',
 target:'homework',taskIndex:3,taskSubject:'Norsk',dueDay:'',repeatDay:'Tirsdag'};
const env={FEEDBACK_HASH_SECRET:'test-secret-0123456789abcdef'};
function createStore(){
 const saved=new Map();
 return {saved,get:async key=>saved.get(key)||null,
  setJSON:async(key,value,{onlyIfNew=false}={})=>{
   if(onlyIfNew&&saved.has(key))return {modified:false};
   saved.set(key,value);return {modified:true};
  }};
}
const req=data=>new Request('https://www.skoleuka.no/api/report-issue',{method:'POST',
 headers:{'content-type':'application/json',origin:'https://www.skoleuka.no',
 'x-nf-client-connection-ip':'203.0.113.10'},body:JSON.stringify(data)});

test('Homework report contains only source-backed task reference, not family progress',()=>{
 assert.deepEqual(validateIssueReport(base),base);
 const record=validateIssueReport({...base,childName:'Maya',
  profileId:'private',checked:true,accountId:'not-public'});
 assert.deepEqual(record,base);
 for(const update of [
  {taskIndex:-1},{taskIndex:501},{taskIndex:'3'},{dueDay:'Søndag'},
  {repeatDay:'Hver dag'},{target:'not-homework'},{taskSubject:'x'.repeat(66)},
  {sourceText:''}
 ])assert.equal(validateIssueReport({...base,...update}),null,JSON.stringify(update));
});

test('Homework-only error categories require homework context; missing homework requires details',()=>{
 for(const kind of ['duplicate_homework','not_homework','missing_homework']){
  assert.ok(validateIssueReport({...base,kind,details:kind==='missing_homework'?'Leksesiden mangler et avsnitt':''}));
  assert.equal(validateIssueReport({...base,kind,target:null}),null);
 }
 assert.equal(validateIssueReport({...base,kind:'missing_homework',details:'Kort'}),null);
 const legacy={kind:'wrong_date',school:'fagerholt',grade:'3',year:2026,week:46,
  pdf,sourcePage:1,sourceText:'Til torsdag',details:''};
 assert.deepEqual(validateIssueReport(legacy),legacy);
});

test('A repeated homework feedback submission is idempotent and excludes child identifiers',async()=>{
 const store=createStore(),handle=createIssueReportHandler({storeFactory:async()=>store,env,
  now:()=>Date.parse('2026-11-10T12:00:00Z')});
 assert.equal((await handle(req(base))).status,201);
 const response=await handle(req(base));
 assert.equal(response.status,200);
 assert.equal((await response.json()).duplicate,true);
 const reports=[...store.saved.entries()].filter(([k])=>k.startsWith('reports/'));
 assert.equal(reports.length,1);
 assert.equal(reports[0][1].target,'homework');
 assert.equal(reports[0][1].taskIndex,3);
 assert.equal(reports[0][1].repeatDay,'Tirsdag');
 for(const field of ['profileId','checked','childName','email','accountId'])
  assert.ok(!(field in reports[0][1]));
});

test('Section reporting replaces individual homework buttons without changing checkboxes',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const dialog=readFileSync(new URL('../public/report-issue.mjs',import.meta.url),'utf8');
 const admin=readFileSync(new URL('../public/admin/app.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(app,/data-report-homework/);
 for(const name of ['homework','bag','program','notices','vocabulary','vocabulary-nb'])
  assert.ok(html.includes('data-report-section="'+name+'"'),name);
 assert.match(app,/const sectionControl=e.target.closest/);
 assert.match(app,/homeworkDisplayGroups\(homework\)/);
 assert.match(dialog,/issue-report-item-field/);
 assert.match(dialog,/target:'homework'/);
 assert.match(admin,/lignende rapporter/);
});
test('Section metadata is optional, bounded and never admits private account fields',()=>{
 const example={kind:'wrong_interpretation',school:'fagerholt',grade:'3',year:2026,
  week:46,pdf,sourcePage:null,sourceText:'',details:'Matte mangler',section:'homework',
  childId:'not-public'};
 const checked=validateIssueReport(example);
 assert.equal(checked.section,'homework');
 assert.equal(checked.childId,undefined);
 assert.equal(validateIssueReport({...example,section:'family-activities'}),null);
 assert.deepEqual(validateIssueReport({...base,section:'homework'}),{...base,section:'homework'});
 assert.equal(validateIssueReport({...base,section:'bag'}),null);
 assert.ok(validateIssueReport({...example,kind:'missing_homework',details:'Det mangler en lekse i ukeplanen'}));
 assert.equal(validateIssueReport({...example,kind:'missing_homework',section:'bag'}),null);
});
