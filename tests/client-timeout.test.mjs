import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('client waits longer for larger PDF than backend PDF HTTP timeout',()=>{
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const api=readFileSync(new URL('../netlify/functions/plan.mjs',import.meta.url),'utf8');
  assert.match(app,/fetchJSON\(`\/api\/plan\?grade=\$\{encodeURIComponent\(grade\)\}`\s*,\s*32000\)/);
  assert.match(api,/AbortSignal\.timeout\(pdf \? 24000 : 12000\)/);
});
