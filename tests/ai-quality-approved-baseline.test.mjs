import test from 'node:test';
import assert from 'node:assert/strict';
import {APPROVED_BASELINE,checkApprovedOriginalBaseline,approvedBaselineMarkdown} from '../scripts/check-approved-original-pdf-baseline.mjs';

const makeReport=()=>({
 summary:{parserFailed:13},
 cases:APPROVED_BASELINE.sources.map(source=>{
  const checkSize=1+Math.max(...source.passedChecks.map(c=>c.index));
  const anchorSize=1+Math.max(...source.passedAnchors.map(c=>c.index));
  const checks=Array.from({length:checkSize},()=>({expected:null,passed:false}));
  const anchors=Array.from({length:anchorSize},()=>({page:0,contains:'',found:false}));
  for(const c of source.passedChecks)checks[c.index]={expected:structuredClone(c.expected),passed:true};
  for(const a of source.passedAnchors)anchors[a.index]={...structuredClone(a.expected),found:true};
  return {id:source.id,sourceStatus:'verified',expectedSha256:source.sha256,checks,anchors};
 })
});
test('Approved non-regression ratchet records exactly 13 parser facts and 18 source anchors',()=>{
 assert.equal(APPROVED_BASELINE.sources.length,4);
 assert.equal(APPROVED_BASELINE.sources.reduce((sum,x)=>sum+x.passedChecks.length,0),13);
 assert.equal(APPROVED_BASELINE.sources.reduce((sum,x)=>sum+x.passedAnchors.length,0),18);
 const result=checkApprovedOriginalBaseline(makeReport());
 assert.equal(result.passed,true);
 assert.equal(result.parser.passed,13);
 assert.equal(result.anchors.passed,18);
 assert.match(approvedBaselineMarkdown(result),/Outstanding original-PDF parser gaps.*13/);
});
test('A regression of one previously passing homework fact fails',()=>{
 const report=makeReport();
 report.cases[0].checks[0].passed=false;
 const result=checkApprovedOriginalBaseline(report);
 assert.equal(result.passed,false);
 assert.equal(result.regressions.length,1);
 assert.match(result.regressions[0],/formerly passing fact now fails/);
});
test('A previously readable PDF source anchor cannot silently disappear',()=>{
 const report=makeReport();
 report.cases[0].anchors[0].found=false;
 const result=checkApprovedOriginalBaseline(report);
 assert.equal(result.passed,false);
 assert.equal(result.regressions.length,1);
});
test('Changed golden expectation, hash drift or missing source block green gate',()=>{
 for(const mutation of [
  r=>r.cases[0].checks[0].expected.contains='made-up replacement',
  r=>r.cases[0].expectedSha256='a'.repeat(64),
  r=>r.cases[0].sourceStatus='unavailable',
  r=>r.cases.shift()
 ]){
  const report=makeReport();mutation(report);
  const result=checkApprovedOriginalBaseline(report);
  assert.equal(result.passed,false);
  assert.ok(result.blockers.length>=1);
 }
});
test('New correct results may improve baseline without requiring reapproval',()=>{
 const report=makeReport();
 report.cases[2].checks.push({expected:{kind:'homework',contains:'Matteark med divisjon'},passed:true});
 const result=checkApprovedOriginalBaseline(report);
 assert.equal(result.passed,true);
});
