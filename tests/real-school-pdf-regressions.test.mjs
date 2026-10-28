import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_SCHEMA_VERSION,normalizeAIPlan} from '../lib/ai-plan.mjs';
import {analyzePdfPages,findPdfLinks,choosePdf} from '../lib/plan-core.mjs';
import {planFeedback} from '../public/shared/plan-feedback.mjs';

const lundePdf='https://www.minskole.no/DynamicContent//Documents/884-lundeskole-Uke-44-(3)-6e2306a5-43ae.pdf';
const sjostrandPdf='https://www.minskole.no/DynamicContent//Documents/866-Sjostrand-ukebrev-uke-44-(1)-6a29d416-9df9.pdf';
const days=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
const evidence={sourcePage:1,sourceQuote:'Les ukebrevet fra skolen for denne uken'};
const raw={days:days.map(day=>({day,events:[]})),homework:[],packing:[],notices:[{day:null,text:'Husk turen på torsdag',...evidence}],learningGoals:[],subjects:[],weekTheme:{text:null,sourcePage:null,sourceQuote:''},optionalMission:{text:null,sourcePage:null,sourceQuote:''}};
const meta={grade:'7A',year:2026,week:44,source:'https://www.minskole.no/sjostrand/seksjon/999',pdf:sjostrandPdf,pageCount:1};

test('Lunde and Sjøstrand named PDF URLs are recognized as week 44 PDFs',()=>{
  for(const pdf of [lundePdf,sjostrandPdf]){
    const html=`<a href="${pdf}">Ukeplan / ukebrev uke 44</a>`;
    assert.equal(choosePdf(findPdfLinks(html,'https://www.minskole.no/lundeskole/seksjon/123'),44)?.url,pdf);
  }
});
test('AI accepts source-page evidence on an image-only school PDF',()=>{
  assert.equal(AI_SCHEMA_VERSION>=2,true,'invalidate cached output from earlier evidence logic');
  const result=normalizeAIPlan(raw,{...meta,pageTexts:['']});
  assert.equal(result.parser,'ai');assert.equal(result.notices[0],'Husk turen på torsdag');
  assert.equal(result.status,'partial');
});
test('AI still rejects invalid pages or too-short source quotes on scanned PDFs',()=>{
  const x=structuredClone(raw);
  x.notices=[{...evidence,sourcePage:3,day:null,text:'Uten kilde'},{sourcePage:1,sourceQuote:'hei',day:null,text:'For kort'}];
  assert.throws(()=>normalizeAIPlan(x,{...meta,pageTexts:['']}),/ingen nyttige/);
});
test('Subject headings alone must not produce a ready but empty timetable',()=>{
  const x=structuredClone(raw);
  x.notices=[];x.subjects=[{...evidence,text:'Matematikk'}];
  x.weekTheme={...evidence,text:'Matematikk'};
  assert.throws(()=>normalizeAIPlan(x,{...meta,pageTexts:['']}),/ingen nyttige/);
});
test('Sparse Lunde-like daily extraction must be partial, never falsely complete',()=>{
  const page={width:600,height:800,items:[{text:'Mandag: Tur i skogen',x:30,y:120,width:200}]};
  const result=analyzePdfPages([page],'6',lundePdf,44,2026,'https://www.minskole.no/lundeskole/seksjon/111');
  assert.equal(result.days.Mandag.events[0]?.title,'Tur i skogen');
  assert.equal(result.status,'partial');
});
test('Sjøstrand PDF without a text layer shows AI processing, not unreadable',()=>{
  const school={name:'Sjøstrand skole',homepage:'https://www.minskole.no/sjostrand'};
  const screen=planFeedback({school,grade:'7A',plan:{status:'partial',aiStatus:'processing',parsedFromPdf:false,pdf:sjostrandPdf}});
  assert.equal(screen.kind,'analyzing');assert.equal(screen.hideContent,true);
  assert.equal(screen.showGrade,true);
  assert.match(screen.description,/tekstlag/);
  const failed=planFeedback({school,grade:'7A',plan:{status:'unreadable',aiStatus:'failed',parsedFromPdf:false,pdf:sjostrandPdf}});
  assert.equal(failed.kind,'missing');assert.equal(failed.showGrade,true);
});
test('Incomplete Lunde-like AI results offer original PDF, not a full-plan badge',()=>{
  const school={name:'Lunde skole',homepage:'https://www.minskole.no/lundeskole'};
  const screen=planFeedback({school,grade:'6',plan:{status:'partial',aiStatus:'ready',pdf:lundePdf}});
  assert.equal(screen.kind,'partial');assert.equal(screen.showGrade,true);
  assert.equal(screen.hideContent,false);
});
