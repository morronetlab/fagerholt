import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {ORIGINAL_PDF_GOLDENS} from './quality/original-pdf-goldens.mjs';
import {evaluateOriginalPdfGoldens,reportOriginalPdfMarkdown,realPdfCheck} from '../scripts/evaluate-original-pdf-quality.mjs';

const pdf=new TextEncoder().encode('%PDF-1.7 mock for quality contract');
const sha=createHash('sha256').update(pdf).digest('hex');
const golden={id:'test-school-2',school:'fagerholt',grade:'2',year:2026,week:45,
 url:'https://www.minskole.no/DynamicContent/Documents/test.pdf',
 sha256:sha,pageCount:1,review:{date:'2026-11-05'},
 sourceAnchors:[{page:1,contains:'LEKSE TIL TIRSDAG'}],
 expectations:[{kind:'homework',contains:'Les boka',dueDay:'Tirsdag'},
   {kind:'exclude_homework',contains:'Vaksine'}]};
const pages=[{width:800,height:600,items:[{text:'LEKSE TIL TIRSDAG: Les boka',x:50,y:100,width:150}]}];
const mockCollect=async({targets,outDir})=>{
 const sample=targets[0];const fileName=sample.id+'.pdf';
 writeFileSync(outDir+'/'+fileName,pdf);
 return {entries:[{id:sample.id,download:'downloaded',sha256:sha,pages:1,fileName}]};
};
const mockPlan=()=>({status:'ok',homework:[{subject:'Norsk',text:'Les boka',dueDay:'Tirsdag',repeatDays:[]}],days:{},dayNotes:{},notices:[]});
test('Real original goldens have strict hashes and explicitly reviewed PDF pages',()=>{
 assert.ok(ORIGINAL_PDF_GOLDENS.length>=4);
 assert.equal(new Set(ORIGINAL_PDF_GOLDENS.map(x=>x.id)).size,ORIGINAL_PDF_GOLDENS.length);
 for(const c of ORIGINAL_PDF_GOLDENS){
  assert.match(c.sha256,/^[a-f0-9]{64}$/);
  assert.match(c.url,/^https:\/\/www\.minskole\.no\/DynamicContent\//);
  assert.ok(c.year===2026&&c.week>=1&&c.week<=53);
  assert.equal(c.review.date,'2026-11-05');
  assert.deepEqual(c.review.pages,Array.from({length:c.pageCount},(_,i)=>i+1));
  assert.ok(c.sourceAnchors.length>=3&&c.expectations.length>=5);
  assert.ok(c.sourceAnchors.every(a=>a.page>=1&&a.page<=c.pageCount&&a.contains.length>=3));
 }
});
test('No personal contact details are included in golden cases',()=>{
 const s=JSON.stringify(ORIGINAL_PDF_GOLDENS);
 assert.doesNotMatch(s,/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
 assert.doesNotMatch(s,/"(?:familyId|childId|userId|authToken|phoneNumber)"\s*:/i);
});
test('Actual-PDF evaluator checks matching SHA and source anchors before scoring',async()=>{
 const report=await evaluateOriginalPdfGoldens({goldens:[golden],collectSamples:mockCollect,
  extractPdf:async()=>pages,parsePlan:mockPlan});
 assert.equal(report.summary.verifiedSources,1);
 assert.equal(report.summary.parserPassed,2);
 assert.equal(report.summary.parserPassPercent,100);
 assert.equal(report.summary.sourceAnchorsPassed,1);
 assert.equal(report.cases[0].parserStatus,'ok');
 assert.doesNotMatch(reportOriginalPdfMarkdown(report),/authToken/);
});
test('Changed PDF checksum is NOT scored as an inaccurate parser',async()=>{
 const report=await evaluateOriginalPdfGoldens({
  goldens:[{...golden,sha256:'0'.repeat(64)}],
  collectSamples:mockCollect,extractPdf:async()=>pages,parsePlan:mockPlan});
 assert.equal(report.cases[0].sourceStatus,'changed');
 assert.equal(report.summary.parserChecks,0);
 assert.equal(report.summary.changedSources,1);
});
test('Unavailable PDF never silently passes and source-anchor failures are reported separately',async()=>{
 const absent=await evaluateOriginalPdfGoldens({goldens:[golden],
  collectSamples:async()=>({entries:[{id:golden.id,download:'unverified',reason:'Official HTTP 404'}]})});
 assert.equal(absent.summary.unavailableSources,1);
 assert.equal(absent.summary.parserChecks,0);
 const missingAnchor=await evaluateOriginalPdfGoldens({goldens:[golden],
  collectSamples:mockCollect,
  extractPdf:async()=>[{width:800,height:600,items:[{text:'Other text'}]}],
  parsePlan:mockPlan});
 assert.equal(missingAnchor.summary.sourceAnchorsPassed,0);
 assert.equal(missingAnchor.summary.parserPassed,2);
});
test('Negative packing assertion and wrong deadlines are detected without changing goldens',()=>{
 assert.equal(realPdfCheck({kind:'exclude_packing',day:'Torsdag',contains:'gymtøy'},
  {days:{Torsdag:{bring:[{label:'Gymtøy'}]}}}).passed,false);
 assert.equal(realPdfCheck({kind:'exclude_packing',day:'Torsdag',contains:'gymtøy'},
  {days:{Torsdag:{bring:[]}}}).passed,true);
 assert.equal(realPdfCheck({kind:'homework',contains:'Les boka',dueDay:'Tirsdag'},
  {homework:[{text:'Les boka',dueDay:'Fredag'}]}).passed,false);
});