import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {QUALITY_REFERENCE_CASES} from './quality/corpus-v1.mjs';
import {evaluateExpectation,evaluateReferenceCases,qualityMarkdown,writeQualityReport} from '../scripts/evaluate-plan-quality.mjs';

const homework=(subject,text,dueDay=null,repeatDays=[])=>({subject,text,dueDay,repeatDays});
const plan={
 homework:[homework('Norsk','Les i bok i sekken',null,['Mandag','Tirsdag'])],
 days:{Fredag:{bring:[{label:'Gymsko'}]}},
 dayNotes:{Onsdag:[{text:'Vaksine onsdag morgen'}]},notices:['Tur er flyttet']
};
test('Quality scorer distinguishes deadline, repeatDays, missing assignments and forbidden homework',()=>{
 assert.equal(evaluateExpectation({kind:'homework',subject:'Norsk',contains:'Les i bok',dueDay:null,repeatDays:['Tirsdag','Mandag']},plan).passed,true);
 assert.equal(evaluateExpectation({kind:'homework',subject:'Norsk',contains:'Les i bok',dueDay:'Torsdag'},plan).passed,false);
 assert.equal(evaluateExpectation({kind:'homework',subject:'Norsk',contains:'Les i bok',repeatDays:['Mandag']},plan).passed,false);
 assert.equal(evaluateExpectation({kind:'homework',contains:'Matte'},plan).passed,false);
 assert.equal(evaluateExpectation({kind:'exclude_homework',contains:'Vaksine'},plan).passed,true);
 assert.equal(evaluateExpectation({kind:'exclude_homework',contains:'Les i bok'},plan).passed,false);
 assert.equal(evaluateExpectation({kind:'homework_empty'},plan).passed,false);
});
test('Quality scorer measures important notes, packing and notices separately',()=>{
 assert.equal(evaluateExpectation({kind:'day_note',day:'Onsdag',contains:'Vaksine'},plan).passed,true);
 assert.equal(evaluateExpectation({kind:'day_note',day:'Tirsdag',contains:'Vaksine'},plan).passed,false);
 assert.equal(evaluateExpectation({kind:'packing',day:'Fredag',contains:'Gymsko'},plan).passed,true);
 assert.equal(evaluateExpectation({kind:'packing',day:'Mandag',contains:'Gymsko'},plan).passed,false);
 assert.equal(evaluateExpectation({kind:'notice',contains:'Tur er flyttet'},plan).passed,true);
});
test('Corpus evaluator executes the real rules parser with source-tier transparency',()=>{
 const result=evaluateReferenceCases();
 assert.equal(result.engine,'rules-fallback');
 assert.equal(result.liveModelCalls,0);
 assert.equal(result.cases.length,QUALITY_REFERENCE_CASES.length);
 assert.equal(result.summary.total,QUALITY_REFERENCE_CASES.reduce((n,c)=>n+c.expectations.length,0));
 assert.equal(result.summary.passed+result.summary.failed,result.summary.total);
 assert.ok(result.summary.byEvidenceTier['indexed-text-only'].total>0);
 assert.ok(result.summary.byEvidenceTier['reconstructed-layout'].total>0);
 assert.ok(result.summary.byEvidenceTier['synthetic-negative'].total>0);
 assert.ok(result.cases.every(c=>c.checks.length===c.total));
});
test('Regression simulation fails scored facts rather than rewriting the gold standard',()=>{
 const sample=QUALITY_REFERENCE_CASES.filter(c=>c.id==='wildsminne-2-w45-homework-grid');
 const wrong=evaluateReferenceCases(sample,{parse:()=>({status:'ok',homework:[],days:{},dayNotes:{}})});
 assert.ok(wrong.summary.failed>=2);
 assert.ok(wrong.cases[0].checks.some(c=>c.expected.kind==='homework'&&!c.passed));
 const crash=evaluateReferenceCases(sample,{parse:()=>{throw Error('simulated parse failure');}});
 assert.equal(crash.summary.failed,crash.summary.total);
 assert.equal(crash.cases[0].parserStatus,'exception');
});
test('Markdown and JSON reports are written locally with clear evidence warnings',()=>{
 const result=evaluateReferenceCases(QUALITY_REFERENCE_CASES.slice(0,1),{parse:()=>({status:'partial',homework:[]})});
 const md=qualityMarkdown(result);
 assert.match(md,/not.*measured accuracy across all real school PDFs/i);
 assert.match(md,/reconstructed-layout/);
 assert.match(md,/Incorrect or missing facts/);
 const target=mkdtempSync(join(tmpdir(),'skoleuka-quality-'));
 try{
  writeQualityReport(target,result);
  const json=JSON.parse(readFileSync(join(target,'quality-report.json'),'utf8'));
  assert.equal(json.schemaVersion,1);
  assert.equal(json.summary.total,result.summary.total);
  assert.match(readFileSync(join(target,'quality-report.md'),'utf8'),/baseline report/);
 }finally{rmSync(target,{recursive:true,force:true});}
});
