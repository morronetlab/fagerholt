import test from 'node:test';
import assert from 'node:assert/strict';
import {ORIGINAL_PDF_GOLDENS} from './quality/original-pdf-goldens.mjs';
import {EXPECTED_CLOSED_WEEKDAYS,checkOriginalClosures,closureGateMarkdown} from '../scripts/check-original-school-closures.mjs';

const copy=x=>JSON.parse(JSON.stringify(x));
const mockReport=()=>({engine:'real-pdf-rules-fallback',cases:ORIGINAL_PDF_GOLDENS.map(x=>({
 id:x.id,sourceStatus:'verified',expectedSha256:x.sha256,
 closedDays:[...EXPECTED_CLOSED_WEEKDAYS[x.id].closedDays],
 closureNoticeKinds:{
  planning:EXPECTED_CLOSED_WEEKDAYS[x.id].planning,
  schoolClosed:EXPECTED_CLOSED_WEEKDAYS[x.id].schoolClosed
 }
}))});

test('B1 approved original school days cover all source-verified PDFs',()=>{
 const check=checkOriginalClosures(mockReport());
 assert.equal(check.passed,true,check.errors.join('\n'));
 assert.equal(check.verifiedOriginals,4);
 assert.equal(check.expectedClosedDays,2);
 assert.match(closureGateMarkdown(check),/Result: PASS/);
 assert.deepEqual(EXPECTED_CLOSED_WEEKDAYS['fagerholt-4-w44-2026'].closedDays,[]);
});
test('Actual school closure cannot silently disappear from report',()=>{
 const r=mockReport();
 r.cases.find(x=>x.id==='nygaard-4-w45-2026').closedDays=[];
 const check=checkOriginalClosures(r);
 assert.equal(check.passed,false);
 assert.ok(check.errors.some(x=>x.includes('nygaard-4-w45-2026')));
});
test('Future-dated Fagerholt November closure must not close week 44',()=>{
 const r=mockReport();
 r.cases.find(x=>x.id==='fagerholt-4-w44-2026').closedDays=['Torsdag','Fredag'];
 assert.equal(checkOriginalClosures(r).passed,false);
});
test('Closure notice, source identity and exact PDF hash are mandatory',()=>{
 for(const modification of [
  r=>{r.cases[1].closureNoticeKinds.planning=false;},
  r=>{r.cases[3].closureNoticeKinds.schoolClosed=false;},
  r=>{r.cases[2].expectedSha256='0'.repeat(64);},
  r=>{r.cases[2].sourceStatus='unavailable';},
  r=>{r.cases.pop();}
 ]){
  const r=copy(mockReport());modification(r);
  assert.equal(checkOriginalClosures(r).passed,false);
 }
});
