import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const script=readFileSync(new URL('../scripts/verify-production.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/production-smoke.yml',import.meta.url),'utf8');

test('Production smoke targets the canonical Skoleuka domain, not the legacy Netlify alias',()=>{
 assert.match(script,/process\.env\.PRODUCTION_URL\|\|'https:\/\/www\.skoleuka\.no'/);
 assert.match(workflow,/PRODUCTION_URL: https:\/\/www\.skoleuka\.no/);
 assert.doesNotMatch(workflow,/PRODUCTION_URL: https:\/\/ukeplanen\.netlify\.app/);
});
test('Production smoke checks deployed invitation handler and live account configuration',()=>{
 assert.match(script,/get\('\/account-ui\.mjs'\)/);
 assert.match(script,/getJson\('\/api\/account-config'\)/);
 assert.match(script,/inviteHandlerReady/);
 assert.match(script,/accountConfig\?\.enabled===true/);
 assert.match(script,/build\.commit!==expected/);
 // One-off week-44 vaccine and gym shoe fixtures must not fail subsequent school weeks.
 assert.match(script,/grade==='2'&&current\.year===2026&&current\.week===44/);
});
test('Production verification runs after each main push and waits for Netlify deployment',()=>{
 assert.match(workflow,/push:\s*\n\s*branches: \[main\]/);
 assert.match(workflow,/for attempt in \{1\.\.24\}; do/);
 assert.match(workflow,/build-info\.json\?verify=\$GITHUB_RUN_ID-\$attempt/);
 assert.match(workflow,/LIVE_COMMIT" = "\$EXPECTED_COMMIT"/);
 assert.match(workflow,/EXPECTED_COMMIT: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.sha \}\}/);
 assert.match(workflow,/run: node scripts\/verify-production\.mjs/);
});
