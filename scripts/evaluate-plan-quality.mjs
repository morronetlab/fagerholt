/** Deterministic, read-only quality evaluator for labelled PDF.js reference fixtures.
 * This measures the RULES/FALLBACK pipeline only. It neither calls a model
 * nor claims to measure live OpenAI PDF extraction accuracy.
 */
import {analyzePdfPages} from '../lib/plan-core.mjs';
import {QUALITY_CORPUS_VERSION,QUALITY_REFERENCE_CASES} from '../tests/quality/corpus-v1.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const norm=s=>String(s??'').normalize('NFKC').toLocaleLowerCase('nb-NO').replace(/\s+/g,' ').trim();
const has=(text,term)=>norm(text).includes(norm(term));
const days=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
const normalizeDays=values=>(Array.isArray(values)?values:[]).filter(day=>days.includes(day)).sort((a,b)=>days.indexOf(a)-days.indexOf(b));
const taskSummary=t=>({subject:t.subject||null,dueDay:t.dueDay??null,repeatDays:normalizeDays(t.repeatDays),text:String(t.text||'').slice(0,100)});
export function evaluateExpectation(expected,plan){
 const homework=Array.isArray(plan?.homework)?plan.homework:[];
 const dayNotes=plan?.dayNotes||{};
 const dayBrings=plan?.days||{};
 const proof={...expected};
 if(expected.kind==='homework'){
  const candidates=homework.filter(t=>(!expected.subject||norm(t.subject)===norm(expected.subject))&&
   (!expected.contains||has(t.text,expected.contains)));
  const passed=candidates.some(t=>
   (!Object.hasOwn(expected,'dueDay')||(t.dueDay??null)===expected.dueDay)&&
   (!Object.hasOwn(expected,'repeatDays')||
    JSON.stringify(normalizeDays(t.repeatDays))===JSON.stringify(normalizeDays(expected.repeatDays))));
  return {expected:proof,passed,observed:candidates.slice(0,3).map(taskSummary)};
 }
 if(expected.kind==='exclude_homework'){
  const hits=homework.filter(t=>has(t.text,expected.contains));
  return {expected:proof,passed:hits.length===0,observed:hits.slice(0,2).map(taskSummary)};
 }
 if(expected.kind==='homework_empty')
  return {expected:proof,passed:homework.length===0,observed:{count:homework.length}};
 if(expected.kind==='packing'){
  const items=dayBrings[expected.day]?.bring||[];
  const matches=items.filter(t=>has(t.label||t,expected.contains));
  return {expected:proof,passed:matches.length>0,observed:{matching:matches.length}};
 }
 if(expected.kind==='day_note'){
  const items=dayNotes[expected.day]||[];
  const matches=items.filter(t=>has(t.text||t,expected.contains));
  return {expected:proof,passed:matches.length>0,observed:{matching:matches.length}};
 }
 if(expected.kind==='notice'){
  const matches=(plan?.notices||[]).filter(t=>has(t.text||t,expected.contains));
  return {expected:proof,passed:matches.length>0,observed:{matching:matches.length}};
 }
 throw Error('Unsupported expectation kind: '+expected.kind);
}
function aggregate(results,field){
 const out={};
 for(const result of results){
  const key=String(field(result));
  out[key]??={passed:0,total:0};
  out[key].total++;if(result.passed)out[key].passed++;
 }
 return Object.fromEntries(Object.entries(out).sort(([a],[b])=>a.localeCompare(b)));
}
export function evaluateReferenceCases(cases=QUALITY_REFERENCE_CASES,{parse=analyzePdfPages}={}){
 const caseResults=[];
 for(const entry of cases){
  let plan=null,error=null;
  try{
   // The year for indexed-text-only excerpts is an evaluator parameter, never
   // a claim about the original PDF's unknown publication year.
   plan=parse(entry.input.pages,entry.source.grade,
    entry.source.pdfUrl||'https://www.minskole.no/DynamicContent/Documents/quality-fixture.pdf',
    entry.source.week,entry.source.year??2026,entry.source.sectionUrl);
  }catch(e){error=String(e?.message||e).slice(0,160);}
  const checks=entry.expectations.map(expectation=>{
   if(error)return {expected:expectation,passed:false,observed:{parserError:error}};
   try{return evaluateExpectation(expectation,plan);}
   catch(e){return {expected:expectation,passed:false,observed:{evaluatorError:String(e.message).slice(0,100)}};}
  });
  caseResults.push({
   id:entry.id,title:entry.title,evidenceTier:entry.evidenceTier,
   source:{school:entry.source.school,grade:entry.source.grade,week:entry.source.week,year:entry.source.year,
    pdfUrl:entry.source.pdfUrl,reference:entry.source.reference},
   parserStatus:plan?.status||'exception',
   parserError:error,
   passed:checks.filter(c=>c.passed).length,total:checks.length,
   checks
  });
 }
 const flattened=caseResults.flatMap(c=>c.checks.map(check=>({
  kind:check.expected.kind,evidenceTier:c.evidenceTier,passed:check.passed
 })));
 const passed=flattened.filter(c=>c.passed).length;
 return {
  schemaVersion:1,corpusVersion:QUALITY_CORPUS_VERSION,
  engine:'rules-fallback',liveModelCalls:0,
  evidenceNote:'Only reconstructed layout, indexed text excerpts and synthetic negative cases; not full PDF binary or live AI accuracy.',
  summary:{cases:caseResults.length,passed,total:flattened.length,failed:flattened.length-passed,
   passRatePercent:flattened.length?Number((passed*100/flattened.length).toFixed(1)):0,
   byKind:aggregate(flattened,c=>c.kind),byEvidenceTier:aggregate(flattened,c=>c.evidenceTier)},
  cases:caseResults
 };
}
const formatScore=score=>score.passed+'/'+score.total;
export function qualityMarkdown(report){
 const lines=[
  '# AI Quality 2.0 – baseline report',
  '',
  '**Engine:** '+report.engine+' (no OpenAI calls).',
  '**Reference evidence:** '+report.evidenceNote,
  '',
  '## Summary',
  '',
  '- Cases: '+report.summary.cases,
  '- Assertions: '+report.summary.total,
  '- Passed: '+report.summary.passed,
  '- Failed: '+report.summary.failed,
  '- Fixture assertion pass rate: '+report.summary.passRatePercent+'%',
  '',
  'This percentage is **not** measured accuracy across all real school PDFs. Failed cases are preserved as baseline gaps, not silently rewritten.',
  '',
  '## By expectation kind',
  '',
  '| Kind | Pass / Total |',
  '| --- | ---: |',
  ...Object.entries(report.summary.byKind).map(([kind,score])=>'| '+kind+' | '+formatScore(score)+' |'),
  '',
  '## By evidence tier',
  '',
  '| Tier | Pass / Total |',
  '| --- | ---: |',
  ...Object.entries(report.summary.byEvidenceTier).map(([tier,score])=>'| '+tier+' | '+formatScore(score)+' |'),
  '',
  '## Cases',
  '',
  '| Case | Tier | Pass / Total | Parse status |',
  '| --- | --- | ---: | --- |',
  ...report.cases.map(c=>'| '+c.id+' | '+c.evidenceTier+' | '+c.passed+'/'+c.total+' | '+c.parserStatus+' |'),
  '',
  '## Incorrect or missing facts',
  ''
 ];
 const failed=report.cases.flatMap(c=>c.checks.filter(check=>!check.passed).map(check=>({id:c.id,check})));
 if(!failed.length)lines.push('No mismatches found in these limited fixtures.');
 else for(const {id,check} of failed)
  lines.push('- **'+id+'**: '+JSON.stringify(check.expected)+' — observed: '+JSON.stringify(check.observed));
 lines.push('','No private family data, source PDF binaries or AI request logs were used.','');
 return lines.join('\n');
}
export function writeQualityReport(dir,report){
 const target=resolve(dir);
 mkdirSync(target,{recursive:true});
 writeFileSync(resolve(target,'quality-report.json'),JSON.stringify(report,null,2)+'\n','utf8');
 writeFileSync(resolve(target,'quality-report.md'),qualityMarkdown(report),'utf8');
 return target;
}
const executedAsScript=process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]);
if(executedAsScript){
 const idx=process.argv.indexOf('--out-dir');
 if(idx>=0&&!process.argv[idx+1])throw Error('Missing --out-dir value');
 const report=evaluateReferenceCases();
 if(idx>=0)writeQualityReport(process.argv[idx+1],report);
 console.log(qualityMarkdown(report));
 // Baseline mode is deliberately informative, not a quality threshold gate.
 // Structural errors and contract tests DO fail in npm check.
}
