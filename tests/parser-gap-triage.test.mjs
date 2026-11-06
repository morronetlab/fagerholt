import test from 'node:test';
import assert from 'node:assert/strict';
import {ORIGINAL_PDF_GOLDENS} from './quality/original-pdf-goldens.mjs';
import {APPROVED_BASELINE} from '../scripts/check-approved-original-pdf-baseline.mjs';
import {TRIAGE_V1,validateTriageManifest,classifyParserGaps,parserGapMarkdown} from '../scripts/report-parser-gaps.mjs';

function syntheticOriginalPdfScorecard(){
 const passing=new Map(APPROVED_BASELINE.sources.map(b=>[b.id,new Set(b.passedChecks.map(x=>x.index))]));
 const knownText=new Map(APPROVED_BASELINE.sources.map(b=>[b.id,new Set(b.passedAnchors.map(x=>x.index))]));
 return {engine:'real-pdf-rules-fallback',liveModelCalls:0,cases:ORIGINAL_PDF_GOLDENS.map(g=>({
  id:g.id,sourceStatus:'verified',expectedSha256:g.sha256,
  checks:g.expectations.map((expected,index)=>({
   expected:structuredClone(expected),passed:passing.get(g.id).has(index)})),
  anchors:g.sourceAnchors.map((expected,index)=>({
   ...structuredClone(expected),found:knownText.get(g.id).has(index)}))
 }))};
}

test('PR A ledger fully partitions the 26 goldens and the 19 PDF anchors',()=>{
 const manifest=validateTriageManifest();
 assert.equal(manifest.valid,true,manifest.errors.join('\n'));
 assert.equal(manifest.trackedGaps,13);
 assert.equal(manifest.approvedPassing,13);
 assert.equal(manifest.approvedAnchors,18);
 assert.equal(manifest.trackedTextLayer,1);
 assert.equal(TRIAGE_V1.issues.length,13);
 assert.equal(new Set(TRIAGE_V1.issues.map(x=>x.id)).size,13);
 assert.equal(TRIAGE_V1.sourceExtractionIssues.length,1);
});

test('All 13 known failed assertions are individually prioritized with source-matched evidence',()=>{
 const result=classifyParserGaps(syntheticOriginalPdfScorecard());
 assert.equal(result.valid,true,result.errors.join('\n'));
 assert.equal(result.summary.sources,4);
 assert.equal(result.summary.verifiedSources,4);
 assert.equal(result.summary.trackedGaps,13);
 assert.equal(result.summary.open,13);
 assert.equal(result.summary.resolved,0);
 assert.equal(result.summary.blocked,0);
 assert.equal(result.summary.byPriority.P0.open,2);
 assert.equal(result.summary.byPriority.P1.open,8);
 assert.equal(result.summary.byPriority.P2.open,3);
 assert.equal(result.summary.byCategory.homework_extraction_deadline.open,7);
 assert.equal(result.summary.byCategory.packing_day_attribution.open,3);
 assert.equal(result.summary.byCategory.critical_school_notice.open,2);
 assert.equal(result.summary.byCategory.closed_day_packing_conflict.open,1);
 assert.equal(result.summary.textLayer.open,1);
 const markdown=parserGapMarkdown(result);
 assert.match(markdown,/B1 – P0 school closure/);
 assert.match(markdown,/NOT measured live AI accuracy/);
 assert.match(markdown,/nygaard-4-w45-2026:anchor:0/);
 assert.equal((markdown.match(/### P[012] · /g)||[]).length,13);
});

test('Previously failing assertion can become resolved, without rewriting the golden or baseline',()=>{
 const scored=syntheticOriginalPdfScorecard();
 scored.cases[0].checks[5].passed=true;
 const result=classifyParserGaps(scored);
 assert.equal(result.valid,true,result.errors.join('\n'));
 assert.equal(result.summary.open,12);
 assert.equal(result.summary.resolved,1);
 assert.equal(result.issues.find(x=>x.id==='sjostrand-2-w44-2026:5').status,'resolved');
});

test('Formerly passing assertion becoming false fails integrity rather than hiding regression',()=>{
 const scored=syntheticOriginalPdfScorecard();
 scored.cases[0].checks[0].passed=false;
 const result=classifyParserGaps(scored);
 assert.equal(result.valid,false);
 assert.ok(result.errors.some(x=>x.includes('New regression in previously passing parser check')));
 assert.equal(result.summary.open,13,'Existing known gaps are still shown');
});

test('Unavailable sources, changed SHA or changed expected fact block scoring',()=>{
 const variations=[
  s=>{s.cases[0].sourceStatus='unavailable';},
  s=>{s.cases[0].expectedSha256='0'.repeat(64);},
  s=>{s.cases[0].checks[5].expected.contains='invented task';},
  s=>{s.cases[0].anchors[0].page=9;}
 ];
 for(const vary of variations){
  const score=syntheticOriginalPdfScorecard();vary(score);
  const result=classifyParserGaps(score);
  assert.equal(result.valid,false);
  assert.ok(result.errors.length>0);
  assert.equal(result.issues.find(x=>x.sourceId==='sjostrand-2-w44-2026').status,'blocked');
 }
});

test('Changed approved expectations, missing ledger entry and mismatched category fail contract',()=>{
 for(const vary of [
  l=>l.issues.pop(),
  l=>l.issues[0].expected.contains='forged',
  l=>l.issues[0].sourceSha256='0'.repeat(64),
  l=>l.issues[0].category='critical_school_notice',
  l=>l.issues.push(structuredClone(l.issues[0]))
 ]){
  const ledger=structuredClone(TRIAGE_V1);vary(ledger);
  const result=validateTriageManifest(ledger);
  assert.equal(result.valid,false,'tampering with manual triage must be detected');
 }
});

test('PDF.js text-layer miss is separate from the 13 rules parser discrepancies',()=>{
 const scored=syntheticOriginalPdfScorecard();
 const nygaard=scored.cases.find(x=>x.id==='nygaard-4-w45-2026');
 nygaard.anchors[0].found=true;
 const report=classifyParserGaps(scored);
 assert.equal(report.valid,true);
 assert.equal(report.summary.textLayer.open,0);
 assert.equal(report.summary.textLayer.resolved,1);
 assert.equal(report.summary.trackedGaps,13);
 assert.equal(report.summary.open,13);
});
