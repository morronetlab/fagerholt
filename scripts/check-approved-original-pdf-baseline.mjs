/** Non-regression ratchet for manually reviewed original-PDF facts.
 * Do not treat the existing failures as correct, and never regenerate the
 * approved baseline from a parser output during CI.
 */
import {readFileSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const APPROVED_BASELINE=JSON.parse(readFileSync(
 new URL('../tests/quality/approved-original-pdf-baseline-v1.json',import.meta.url),'utf8'));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function checkApprovedOriginalBaseline(report,baseline=APPROVED_BASELINE){
 const blockers=[],regressions=[];
 let requiredParser=0,passingParser=0,requiredAnchors=0,passingAnchors=0;
 const byId=new Map((report?.cases||[]).map(c=>[c.id,c]));
 for(const required of baseline.sources||[]){
  const c=byId.get(required.id);
  if(!c){blockers.push(required.id+': original PDF was not evaluated');continue;}
  if(c.sourceStatus!=='verified'){
   blockers.push(required.id+': source '+c.sourceStatus+(c.reason?' ('+c.reason+')':''));
   continue;
  }
  if(c.expectedSha256!==required.sha256){
   blockers.push(required.id+': approved source SHA changed; human review required');
   continue;
  }
  for(const known of required.passedChecks){
   requiredParser++;
   const actual=c.checks?.[known.index];
   if(!actual||!same(actual.expected,known.expected)){
    blockers.push(required.id+' parser check '+known.index+': golden expectation changed');
   }else if(!actual.passed){
    regressions.push(required.id+' parser check '+known.index+': formerly passing fact now fails');
   }else passingParser++;
  }
  for(const known of required.passedAnchors){
   requiredAnchors++;
   const actual=c.anchors?.[known.index];
   if(!actual||!same({page:actual.page,contains:actual.contains},known.expected)){
    blockers.push(required.id+' source anchor '+known.index+': golden evidence changed');
   }else if(!actual.found){
    regressions.push(required.id+' source anchor '+known.index+': formerly extracted PDF evidence missing');
   }else passingAnchors++;
  }
 }
 return {
  approvedAt:baseline.approvedAt,
  passed:!blockers.length&&!regressions.length,
  parser:{required:requiredParser,passed:passingParser},
  anchors:{required:requiredAnchors,passed:passingAnchors},
  blockers,regressions,
  remainingKnownParserGaps:report?.summary?.parserFailed??null,
  note:'Previously correct facts must not regress. Existing failures are never accepted as gold and remain in the quality report.'
 };
}
export function approvedBaselineMarkdown(result){
 const lines=['## Reviewed original-PDF non-regression gate','',
  '**Status:** '+(result.passed?'PASS':'FAIL'),
  '- Previously passing parser facts: '+result.parser.passed+'/'+result.parser.required,
  '- Previously passing PDF text anchors: '+result.anchors.passed+'/'+result.anchors.required,
  '- Outstanding original-PDF parser gaps (not waived): '+String(result.remainingKnownParserGaps),
  '- Approved baseline date: '+result.approvedAt,
  '',
  'This ratchet prevents losing previous correct results without hiding or accepting known misses.',
  ''
 ];
 for(const item of result.blockers)lines.push('- Source/review blocker: '+item);
 for(const item of result.regressions)lines.push('- Regression: '+item);
 return lines.join('\n')+'\n';
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const file=process.argv[2];
 if(!file)throw Error('Expected JSON quality report path');
 const report=JSON.parse(readFileSync(resolve(file),'utf8'));
 const result=checkApprovedOriginalBaseline(report);
 const markdown=approvedBaselineMarkdown(result);
 console.log(markdown);
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,markdown);
 if(!result.passed)process.exitCode=1;
}