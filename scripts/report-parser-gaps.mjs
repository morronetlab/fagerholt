/** Read-only triage of reviewed original-PDF rules-parser reports.
 * Uses existing JSON scorecard; never calls AI, parses live family data or
 * modifies production parsers or reviewed golden expectations.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ORIGINAL_PDF_GOLDENS} from '../tests/quality/original-pdf-goldens.mjs';
import {APPROVED_BASELINE} from './check-approved-original-pdf-baseline.mjs';

export const TRIAGE_V1=JSON.parse(readFileSync(new URL('../tests/quality/parser-gap-triage-v1.json',import.meta.url),'utf8'));
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const priorityRank={P0:0,P1:1,P2:2};
const categoryKinds={
 critical_school_notice:'notice',
 closed_day_packing_conflict:'exclude_packing',
 homework_extraction_deadline:'homework',
 packing_day_attribution:'packing'
};
const idFor=(source,index)=>source+':'+index;
const anchorFor=(source,index)=>source+':anchor:'+index;

export function validateTriageManifest(ledger=TRIAGE_V1,goldens=ORIGINAL_PDF_GOLDENS,baseline=APPROVED_BASELINE){
 const errors=[],goldMap=new Map(goldens.map(g=>[g.id,g]));
 const passed=new Set(),passedAnchors=new Set(),tracked=new Set(),trackedAnchors=new Set();
 if(ledger?.schemaVersion!==1||ledger?.engine!=='real-pdf-rules-fallback')errors.push('Invalid ledger schema/engine');
 if(goldMap.size!==goldens.length)errors.push('Duplicate source IDs');
 if(baseline.sources?.length!==goldens.length)errors.push('Approved baseline does not cover all originals');
 const baselines=new Map((baseline.sources||[]).map(b=>[b.id,b]));
 for(const g of goldens){
  const b=baselines.get(g.id);
  if(!b||b.sha256!==g.sha256){errors.push(g.id+': approved source mismatch');continue;}
  for(const x of b.passedChecks||[]){
   if(!eq(g.expectations[x.index],x.expected))errors.push(g.id+': approved golden drift '+x.index);
   passed.add(idFor(g.id,x.index));
  }
  for(const x of b.passedAnchors||[]){
   if(!eq(g.sourceAnchors[x.index],x.expected))errors.push(g.id+': approved anchor drift '+x.index);
   passedAnchors.add(anchorFor(g.id,x.index));
  }
 }
 for(const x of ledger.issues||[]){
  const g=goldMap.get(x.sourceId),expected=g?.expectations?.[x.expectationIndex];
  if(!expected||x.id!==idFor(x.sourceId,x.expectationIndex)){errors.push('Invalid triage target '+x.id);continue;}
  if(tracked.has(x.id))errors.push('Duplicate issue '+x.id);
  tracked.add(x.id);
  if(passed.has(x.id))errors.push('Passing check marked as failure '+x.id);
  if(g.sha256!==x.sourceSha256||!eq(expected,x.expected))errors.push('Reviewed expectation/hash drift '+x.id);
  if(!(x.priority in priorityRank)||categoryKinds[x.category]!==expected.kind)
   errors.push('Invalid severity or category '+x.id);
  for(const field of ['symptom','causeHypothesis','proposedFix','acceptance']){
   if(typeof x[field]!=='string'||x[field].trim().length<14)errors.push('Missing '+field+' '+x.id);
  }
  if(!Array.isArray(x.investigateFiles)||!x.investigateFiles.length)
   errors.push('Missing investigation targets '+x.id);
 }
 for(const g of goldens)g.expectations.forEach((_,i)=>{
  const id=idFor(g.id,i);
  if(!passed.has(id)&&!tracked.has(id))errors.push('Untriaged parser assertion '+id);
 });
 for(const x of ledger.sourceExtractionIssues||[]){
  const g=goldMap.get(x.sourceId),anchor=g?.sourceAnchors?.[x.anchorIndex];
  if(!anchor||x.id!==anchorFor(x.sourceId,x.anchorIndex)||!eq(anchor,x.expected)||x.sourceSha256!==g.sha256)
   errors.push('Invalid source-text issue '+x.id);
  if(passedAnchors.has(x.id))errors.push('Approved source anchor marked missing '+x.id);
  if(trackedAnchors.has(x.id))errors.push('Duplicate source-text issue '+x.id);
  trackedAnchors.add(x.id);
 }
 for(const g of goldens)g.sourceAnchors.forEach((_,i)=>{
  const id=anchorFor(g.id,i);
  if(!passedAnchors.has(id)&&!trackedAnchors.has(id))errors.push('Untriaged source-text anchor '+id);
 });
 return {valid:errors.length===0,errors,approvedPassing:passed.size,
  trackedGaps:tracked.size,approvedAnchors:passedAnchors.size,trackedTextLayer:trackedAnchors.size};
}

export function classifyParserGaps(report,{ledger=TRIAGE_V1,goldens=ORIGINAL_PDF_GOLDENS,baseline=APPROVED_BASELINE}={}){
 const contract=validateTriageManifest(ledger,goldens,baseline),errors=[...contract.errors];
 if(report?.engine!=='real-pdf-rules-fallback'||report?.liveModelCalls!==0)
  errors.push('Unexpected evaluator engine or live AI calls');
 const reports=new Map((report?.cases||[]).map(c=>[c.id,c]));
 const verified=new Map();
 for(const g of goldens){
  const actual=reports.get(g.id);
  let reason=null;
  if(!actual||actual.sourceStatus!=='verified')reason='missing or unverified original';
  else if(actual.expectedSha256!==g.sha256)reason='SHA-256 mismatch';
  else if(actual.checks?.length!==g.expectations.length||actual.anchors?.length!==g.sourceAnchors.length)
   reason='assertion counts changed';
  else for(let i=0;i<g.expectations.length;i++)if(!eq(actual.checks[i].expected,g.expectations[i]))
   reason='reviewed parser expectation changed at '+i;
  if(!reason&&actual)for(let i=0;i<g.sourceAnchors.length;i++)
   if(!eq({page:actual.anchors[i]?.page,contains:actual.anchors[i]?.contains},g.sourceAnchors[i]))
    reason='reviewed source anchor changed at '+i;
  if(reason)errors.push(g.id+': '+reason);
  verified.set(g.id,!reason);
 }
 const issues=(ledger.issues||[]).map(x=>{
  const actual=reports.get(x.sourceId),check=verified.get(x.sourceId)?actual?.checks?.[x.expectationIndex]:null;
  return {...x,status:!verified.get(x.sourceId)?'blocked':check?.passed?'resolved':'open'};
 }).sort((a,b)=>priorityRank[a.priority]-priorityRank[b.priority]||
    a.sourceId.localeCompare(b.sourceId)||a.expectationIndex-b.expectationIndex);
 const extracted=(ledger.sourceExtractionIssues||[]).map(x=>{
  const actual=reports.get(x.sourceId),anchor=verified.get(x.sourceId)?actual?.anchors?.[x.anchorIndex]:null;
  return {...x,status:!verified.get(x.sourceId)?'blocked':anchor?.found?'resolved':'open'};
 });
 const already=new Set(issues.map(x=>x.id)),knownAnchors=new Set(extracted.map(x=>x.id));
 for(const g of goldens){
  if(!verified.get(g.id))continue;
  const actual=reports.get(g.id);
  g.expectations.forEach((_,i)=>{
   if(!actual.checks[i].passed&&!already.has(idFor(g.id,i)))
    errors.push('New regression in previously passing parser check '+idFor(g.id,i));
  });
  g.sourceAnchors.forEach((_,i)=>{
   if(!actual.anchors[i].found&&!knownAnchors.has(anchorFor(g.id,i)))
    errors.push('New source-text regression '+anchorFor(g.id,i));
  });
 }
 const count=items=>({open:items.filter(x=>x.status==='open').length,
  resolved:items.filter(x=>x.status==='resolved').length,
  blocked:items.filter(x=>x.status==='blocked').length});
 const byPriority=Object.fromEntries(Object.keys(priorityRank).map(p=>[p,count(issues.filter(x=>x.priority===p))]));
 const byCategory=Object.fromEntries(Object.keys(categoryKinds).map(k=>[k,count(issues.filter(x=>x.category===k))]));
 return {schemaVersion:1,engine:'real-pdf-rules-fallback',basisRun:ledger.basisRun,
  liveModelCalls:0,valid:errors.length===0,errors,contract,
  summary:{sources:goldens.length,verifiedSources:[...verified.values()].filter(Boolean).length,
   trackedGaps:issues.length,...count(issues),textLayer:count(extracted),
   byPriority,byCategory},
  issues,sourceExtractionIssues:extracted};
}
const protect=s=>String(s).replace(/\|/g,'\\|').replace(/[\r\n]/g,' ');
export function parserGapMarkdown(report){
 const s=report.summary;
 const lines=[
 '# AI Quality 2.0 – PR A: prioritized source-backed parser gaps','',
 'Engine: rules/fallback parser (NOT measured live AI accuracy).',
 'Basis: '+report.basisRun+'.','',
 '## Summary','',
 '- Verified original PDFs: '+s.verifiedSources+'/'+s.sources,
 '- Tracked parser failures: '+s.trackedGaps,
 '- Unresolved: '+s.open,
 '- Now passing: '+s.resolved,
 '- Blocked by source/contract: '+s.blocked,
 '- Separate missing PDF.js anchors: '+s.textLayer.open,
 '- Integrity: '+(report.valid?'PASS':'BLOCKED'), '',
 '## Severity','',
 '| Priority | Open | Resolved | Blocked |',
 '| --- | ---: | ---: | ---: |'];
 for(const [key,v] of Object.entries(s.byPriority))
  lines.push('| '+key+' | '+v.open+' | '+v.resolved+' | '+v.blocked+' |');
 lines.push('','## Categories','','| Category | Open | Resolved | Blocked |',
  '| --- | ---: | ---: | ---: |');
 for(const [k,v] of Object.entries(s.byCategory))
  lines.push('| '+k+' | '+v.open+' | '+v.resolved+' | '+v.blocked+' |');
 lines.push('','## Complete evidence ledger','','| Priority | Source / check | Category | Finding | Result |',
  '| --- | --- | --- | --- | --- |');
 for(const item of report.issues)
  lines.push('| '+item.priority+' | '+item.id+' | '+item.category+' | '+protect(item.symptom)+' | '+item.status+' |');
 lines.push('','## Investigations and acceptance tests','');
 for(const x of report.issues){
  lines.push('### '+x.priority+' · '+x.id,
   '- Expected source-backed fact: '+JSON.stringify(x.expected),
   '- Symptom: '+x.symptom,
   '- Possible explanation (NOT verified root cause): '+x.causeHypothesis,
   '- Files to inspect: '+x.investigateFiles.join(', '),
   '- Proposed change: '+x.proposedFix,
   '- Acceptance: '+x.acceptance,
   '- Status: '+x.status,'');
 }
 lines.push('## Separate PDF text extraction (outside the 13 parser checks)','');
 for(const x of report.sourceExtractionIssues)
  lines.push('- '+x.id+' ('+x.priority+', '+x.status+'): '+x.symptom+
   ' Investigate: '+x.proposedFix);
 lines.push('','## Recommended PR B sequence (NOT implemented here)','',
 '1. B1 – P0 school closure/planning-day notice extraction, then explicit closure precedence over routine packing (P1).',
 '2. B2 – P1 source-verified homework cells, daily reading and short-week/multi-page deadlines.',
 '3. B3 – P2 explicitly instructed, day-attributed packing items; no inferred requirements from routine timetable.',
 '4. After each change, rerun all original-PDF and synthetic fixtures. Preserve all 13 previously passing original checks and their 18 source anchors.',
 '',
 '## Interpretation / safeguards','',
 '- Failed golden assertions are NOT independent production incidents, nor a representative app-wide error rate.',
 '- Specific underlying causes are hypotheses pending source-token tracing; do not implement speculative fixes without cross-PDF tests.',
 '- All seven exclude_homework checks previously passed and must remain protected.',
 '- No AI-model call, source PDF binary, personal contact details or live family data is included.',
 '- A changed/missing PDF or a new failure in previously correct facts blocks the report instead of inflating success.',
 '- Production parsing, database schema and family state are unchanged.','');
 if(report.errors.length)lines.push('## Integrity blockers','',...report.errors.map(x=>'- '+protect(x)),'');
 return lines.join('\n');
}
export function writeParserGapTriage(dir,report){
 const target=resolve(dir);mkdirSync(target,{recursive:true});
 writeFileSync(join(target,'parser-gap-triage.json'),JSON.stringify(report,null,2)+'\n');
 writeFileSync(join(target,'parser-gap-triage.md'),parserGapMarkdown(report));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const input=process.argv[2],out=process.argv[3]||'quality-real-results';
 if(!input)throw Error('Usage: node scripts/report-parser-gaps.mjs <source-quality.json> [output-dir]');
 const report=classifyParserGaps(JSON.parse(readFileSync(resolve(input),'utf8')));
 writeParserGapTriage(out,report);
 console.log(parserGapMarkdown(report));
 // Outstanding known issues are informational; unexpected regressions,
 // unverified sources and tampered expectations fail CI.
 if(!report.valid)process.exitCode=1;
}