/** Source-fingerprinted, ORIGINAL PDF baseline.
 * Fetch public PDF bytes, verify SHA256, parse the downloaded bytes with
 * the existing PDF.js reader, evaluate hand-reviewed golden facts.
 * No OpenAI calls, Netlify Blobs, Supabase, family state, or parser changes.
 */
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {collectOfficialSamples} from './collect-quality-originals.mjs';
import {evaluateExpectation} from './evaluate-plan-quality.mjs';
import {pdfPages} from '../netlify/functions/plan.mjs';
import {analyzePdfPages} from '../lib/plan-core.mjs';
import {ORIGINAL_PDF_GOLDEN_VERSION,ORIGINAL_PDF_GOLDENS} from '../tests/quality/original-pdf-goldens.mjs';

const norm=s=>String(s??'').normalize('NFKC').toLocaleLowerCase('nb-NO')
 .replace(/[^a-zæøå0-9]+/gu,' ').replace(/\s+/g,' ').trim();
const summaryByKind=cases=>{
 const out={};
 for(const entry of cases)for(const check of entry.checks||[]){
  const k=check.kind;
  out[k]??={passed:0,total:0};
  out[k].total++;if(check.passed)out[k].passed++;
 }
 return Object.fromEntries(Object.entries(out).sort(([a],[b])=>a.localeCompare(b,'en')));
};
export function realPdfCheck(expectation,plan){
 if(expectation.kind==='exclude_packing'){
  const found=(plan?.days?.[expectation.day]?.bring||[]).some(x=>norm(x.label||x).includes(norm(expectation.contains)));
  return {kind:expectation.kind,expected:expectation,passed:!found};
 }
 const check=evaluateExpectation(expectation,plan);
 // Never publish raw parser text or contact details in downloadable reports.
 return {kind:expectation.kind,expected:expectation,passed:check.passed};
}
export function reportOriginalPdfMarkdown(report){
 const s=report.summary;
 const lines=['# Skoleuka AI Quality – real original PDF baseline','',
  '**Engine:** '+report.engine+' (no live AI model calls).',
  '**Source standard:** original official PDF bytes + frozen SHA-256 + visually reviewed golden facts.','',
  '## Source coverage','',
  '- Registered source PDFs: '+s.sources,
  '- SHA-256 verified/downloaded: '+s.verifiedSources,
  '- Unavailable: '+s.unavailableSources,
  '- Changed/invalid hash: '+s.changedSources,
  '- Source text anchors: '+s.sourceAnchorsPassed+'/'+s.sourceAnchorsTotal,
  '',
  '## Existing rules-parser baseline (not AI model accuracy)','',
  '- Evaluated golden checks: '+s.parserChecks,
  '- Passed: '+s.parserPassed,
  '- Failed: '+s.parserFailed,
  '- Fixture score: '+s.parserPassPercent+'%',
  '',
  '| Original PDF | Source | PDF text anchors | Parser golden checks |',
  '| --- | --- | ---: | ---: |'];
 for(const c of report.cases)lines.push('| '+c.id+' | '+c.sourceStatus+
   ' | '+c.anchors.filter(x=>x.found).length+'/'+c.anchors.length+
   ' | '+c.checks.filter(x=>x.passed).length+'/'+c.checks.length+' |');
 lines.push('','## By parser category','','| Category | Passed / Total |','| --- | ---: |');
 for(const [kind,score] of Object.entries(s.byKind))
  lines.push('| '+kind+' | '+score.passed+'/'+score.total+' |');
 lines.push('','## Review findings','');
 for(const c of report.cases){
  if(c.sourceStatus!=='verified'){
   lines.push('- **'+c.id+'**: source '+c.sourceStatus+(c.reason?' ('+c.reason+')':'')+'. No parser assertions counted.');
  }else{
   for(const a of c.anchors.filter(x=>!x.found))lines.push('- **'+c.id+'**: PDF.js could not find reviewed page '+a.page+' anchor '+JSON.stringify(a.contains)+'.');
   for(const check of c.checks.filter(x=>!x.passed))
    lines.push('- **'+c.id+'**: rules parser missed '+JSON.stringify(check.expected)+'.');
  }
 }
 if(report.cases.every(c=>c.sourceStatus==='verified'&&c.checks.every(x=>x.passed)&&c.anchors.every(x=>x.found)))
  lines.push('No mismatches in the current limited golden set.');
 lines.push('','No PDF binaries, contact details or private user data are included in this report.',
  'The document hashes must be reviewed if an official PDF is revised. This is a rules-parser baseline; the actual AI model has NOT been measured.','');
 return lines.join('\n');
}
export async function evaluateOriginalPdfGoldens({
 goldens=ORIGINAL_PDF_GOLDENS,fetchImpl=fetch,extractPdf=pdfPages,
 parsePlan=analyzePdfPages,collectSamples=collectOfficialSamples
}={}){
 const tmp=mkdtempSync(join(tmpdir(),'skoleuka-real-pdf-'));
 try{
  const sampleTargets=goldens.map(c=>({id:c.id,school:c.school,grade:c.grade,
   year:c.year,week:c.week,url:c.url}));
  const collected=await collectSamples({targets:sampleTargets,fetchImpl,parsePdf:extractPdf,outDir:tmp});
  const entries=new Map(collected.entries.map(e=>[e.id,e]));
  const cases=[];
  for(const golden of goldens){
   const entry=entries.get(golden.id);
   const c={id:golden.id,school:golden.school,grade:golden.grade,
    reviewDate:golden.review?.date??null,expectedSha256:golden.sha256,
    sourceStatus:'unavailable',reason:null,anchors:[],checks:[],parserStatus:null};
   if(!entry||entry.download!=='downloaded'){c.reason=entry?.reason||'Original not downloaded';cases.push(c);continue;}
   if(entry.sha256!==golden.sha256){c.sourceStatus='changed';c.reason='Official PDF SHA-256 mismatch; must review and refresh goldens';cases.push(c);continue;}
   if(entry.pages!==golden.pageCount){c.sourceStatus='changed';c.reason='PDF page count changed';cases.push(c);continue;}
   c.sourceStatus='verified';
   try{
    const bytes=new Uint8Array(readFileSync(join(tmp,entry.fileName)));
    const pages=await extractPdf(bytes.slice());
    if(pages.length!==golden.pageCount)throw Error('Page count changed after download');
    c.anchors=golden.sourceAnchors.map(a=>({
      page:a.page,contains:a.contains,
      found:Boolean(pages[a.page-1]&&norm((pages[a.page-1].items||[]).map(x=>x.text).join(' ')).includes(norm(a.contains)))
    }));
    const plan=parsePlan(pages,golden.grade,golden.url,golden.week,golden.year,
      'https://www.minskole.no/'+golden.school+'/');
    c.parserStatus=plan.status||'unknown';
    c.checks=golden.expectations.map(e=>realPdfCheck(e,plan));
   }catch(error){
    c.parserStatus='exception';
    c.reason='Original parsed but evaluator failed: '+String(error?.message||error).slice(0,130);
    c.checks=golden.expectations.map(e=>({kind:e.kind,expected:e,passed:false}));
   }
   cases.push(c);
  }
  const verified=cases.filter(c=>c.sourceStatus==='verified');
  const checks=verified.flatMap(c=>c.checks);
  const anchors=verified.flatMap(c=>c.anchors);
  const parserPassed=checks.filter(x=>x.passed).length;
  const report={schemaVersion:1,goldenVersion:ORIGINAL_PDF_GOLDEN_VERSION,
   engine:'real-pdf-rules-fallback',liveModelCalls:0,
   summary:{sources:cases.length,verifiedSources:verified.length,
    unavailableSources:cases.filter(x=>x.sourceStatus==='unavailable').length,
    changedSources:cases.filter(x=>x.sourceStatus==='changed').length,
    sourceAnchorsTotal:anchors.length,sourceAnchorsPassed:anchors.filter(x=>x.found).length,
    parserChecks:checks.length,parserPassed,parserFailed:checks.length-parserPassed,
    parserPassPercent:checks.length?Number((100*parserPassed/checks.length).toFixed(1)):0,
    byKind:summaryByKind(verified)},cases};
  return report;
 }finally{rmSync(tmp,{recursive:true,force:true});}
}
export function writeOriginalPdfReport(target,report){
 const dir=resolve(target);mkdirSync(dir,{recursive:true});
 writeFileSync(join(dir,'original-pdf-quality.json'),JSON.stringify(report,null,2)+'\n');
 writeFileSync(join(dir,'original-pdf-quality.md'),reportOriginalPdfMarkdown(report));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const target=process.argv[2]||'quality-real-results';
 const report=await evaluateOriginalPdfGoldens();
 writeOriginalPdfReport(target,report);
 console.log(reportOriginalPdfMarkdown(report));
 if(report.summary.verifiedSources===0||report.summary.changedSources>0)process.exitCode=1;
}