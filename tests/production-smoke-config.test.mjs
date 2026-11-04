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
});
