import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Regression contracts for guardian progress reconciliation when child PWA writes.
test('Guardian cloud reads are guarded against in-flight writes and refresh on return',()=>{
 const source=readFileSync(new URL('../public/family-ui.mjs',import.meta.url),'utf8');
 assert.match(source,/if\(cloudWrites\)\{cloudResyncPending=true;return;\}/);
 assert.match(source,/revision!==cloudWriteRevision/);
 assert.match(source,/readSequence!==cloudReadSequence/);
 assert.match(source,/finally\{finishCloudWrite\(\);\}/);
 assert.match(source,/addEventListener\('visibilitychange',refreshProgressOnReturn\)/);
 assert.match(source,/addEventListener\('online',refreshProgressOnReturn\)/);
 assert.match(source,/now-lastAutoProgressCheck<15_000/);
});
