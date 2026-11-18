import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/production-smoke.yml',import.meta.url),'utf8');
test('PR smoke validates candidate instead of reading unrelated live production',()=>{
 assert.match(workflow,/pull_request:\s*\n\s*paths:/);
 assert.match(workflow,/Verify PR parser and syntax without production dependency\s*\n\s*if: github\.event_name == 'pull_request'/);
 assert.match(workflow,/node --test tests\/ai-quality-homework-shared-deadline\.test\.mjs/);
});
test('Live production verification remains mandatory on main and manual runs',()=>{
 assert.match(workflow,/push:\s*\n\s*branches: \[main\]/);
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/Wait for Netlify to publish the expected production commit\s*\n\s*if: github\.event_name != 'pull_request'/);
 assert.match(workflow,/Check live production and original school PDFs\s*\n\s*if: github\.event_name != 'pull_request'/);
 assert.match(workflow,/run: node scripts\/verify-production\.mjs/);
});
