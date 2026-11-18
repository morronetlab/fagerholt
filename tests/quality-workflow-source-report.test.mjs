import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Original PDF gate independently reports closures, ratchet, and triage even after a source 404',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/ai-quality-real-pdfs.yml',import.meta.url),'utf8');
 for(const title of [
  'Verify source-backed closure dates and future-week safety',
  'Enforce no regressions of previously correct original-PDF facts',
  'Triage reviewed parser gaps and check source integrity'
 ]){
  const start=workflow.indexOf('      - name: '+title);
  assert.ok(start>=0,title+' must be present');
  const block=workflow.slice(start,workflow.indexOf('      - name:',start+12));
  assert.match(block,/if: \$\{\{ \(success\(\) \|\| failure\(\)\) && hashFiles\(/);
  assert.match(block,/run: node scripts\//);
 }
 assert.match(workflow,/Upload reviewed-facts scorecard only, never original PDF bytes/);
});
