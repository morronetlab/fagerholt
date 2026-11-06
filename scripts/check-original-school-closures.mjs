/** B1: real original-PDF safety gate beyond the 26 goldens.
 * A closed day must have a source-backed notice; future dates must not
 * suppress normal lessons from the referenced original school week.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ORIGINAL_PDF_GOLDENS} from '../tests/quality/original-pdf-goldens.mjs';

export const EXPECTED_CLOSED_WEEKDAYS={
 'sjostrand-2-w44-2026':{closedDays:[],planning:false,schoolClosed:false},
 'fagerholt-4-w44-2026':{closedDays:[],planning:true,schoolClosed:false},
 'lovisenlund-4-w45-2026':{closedDays:['Torsdag','Fredag'],planning:true,schoolClosed:false},
 'nygaard-4-w45-2026':{closedDays:['Torsdag','Fredag'],planning:false,schoolClosed:true}
};
const same=(x,y)=>JSON.stringify(x)===JSON.stringify(y);

export function checkOriginalClosures(report,{goldens=ORIGINAL_PDF_GOLDENS,expected=EXPECTED_CLOSED_WEEKDAYS}={}){
 const errors=[],cases=new Map((report?.cases||[]).map(x=>[x.id,x]));
 if(Object.keys(expected).length!==goldens.length)errors.push('B1 reviewed closure set must cover every original PDF');
 for(const g of goldens){
  const target=expected[g.id],actual=cases.get(g.id);
  if(!target){errors.push('Missing B1 closed-day expectation for '+g.id);continue;}
  if(!actual||actual.sourceStatus!=='verified'||actual.expectedSha256!==g.sha256){
   errors.push(g.id+': source missing/changed or unverified');continue;
  }
  if(!same(actual.closedDays,target.closedDays))
   errors.push(g.id+': wrong closed school days: expected '+JSON.stringify(target.closedDays)+
    ' got '+JSON.stringify(actual.closedDays));
  if(actual.closureNoticeKinds?.planning!==target.planning||
     actual.closureNoticeKinds?.schoolClosed!==target.schoolClosed)
   errors.push(g.id+': source-backed closure notice missing/unexpected');
 }
 return {passed:errors.length===0,verifiedOriginals:goldens.length,
  expectedClosedDays:Object.entries(expected).filter(([,x])=>x.closedDays.length).length,
  errors};
}

export function closureGateMarkdown(result){
 return ['## B1 – Source-backed school closure regression gate','',
  'Result: '+(result.passed?'PASS':'FAIL'),
  'Verified official original PDFs: '+result.verifiedOriginals,
  'Originals with current-week closure: '+result.expectedClosedDays,
  'Future closure references do not cancel current-week lessons.',
  ...result.errors.map(error=>'- '+error),''].join('\n');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const file=process.argv[2];if(!file)throw Error('Expected original-pdf-quality.json');
 const result=checkOriginalClosures(JSON.parse(readFileSync(resolve(file),'utf8')));
 const markdown=closureGateMarkdown(result);console.log(markdown);
 if(process.env.GITHUB_STEP_SUMMARY){
  const {appendFileSync}=await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,markdown);
 }
 if(!result.passed)process.exitCode=1;
}
