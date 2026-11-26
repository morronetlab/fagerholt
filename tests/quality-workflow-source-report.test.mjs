import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/ai-quality-real-pdfs.yml',import.meta.url),'utf8');
function step(title){
 const start=workflow.indexOf('      - name: '+title);
 assert.ok(start>=0,title+' must be present');
 const end=workflow.indexOf('      - name:',start+12);
 return workflow.slice(start,end<0?undefined:end);
}
test('Explicit historical PDF audit reports closures, ratchet and triage even after a source 404',()=>{
 for(const title of [
  'Verify source-backed closure dates and future-week safety',
  'Enforce no regressions of previously correct original-PDF facts',
  'Triage reviewed parser gaps and check source integrity'
 ]){
  const block=step(title);
  assert.match(block,/if: \$\{\{ \(success\(\) \|\| failure\(\)\)/);
  assert.match(block,/github\.event_name == 'workflow_dispatch' && inputs\.historical/);
  assert.match(block,/hashFiles\('quality-real-results\/original-pdf-quality\.json'\) != ''/);
  assert.match(block,/run: node scripts\//);
  assert.doesNotMatch(block,/continue-on-error/);
 }
 assert.match(workflow,/Upload reviewed-facts scorecard only, never original PDF bytes/);
});
test('Current-week PDFs are checked on ordinary CI; frozen originals are opt-in',()=>{
 const current=step('Discover and validate current school-week PDFs');
 assert.match(current,/run: node scripts\/evaluate-current-pdf-quality\.mjs/);
 assert.doesNotMatch(current,/\bif:|continue-on-error/);
 const historical=step('Fetch originals, verify SHA-256 and score existing rules parser');
 assert.match(historical,/if: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.historical \}\}/);
 assert.match(workflow,/historical:\s*\n\s*description:[^\n]+\n\s*type: boolean\n\s*default: false/);
 assert.match(workflow,/cat quality-real-results\/current-pdf-quality\.md/);
});
