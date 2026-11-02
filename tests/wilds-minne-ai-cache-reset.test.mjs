import test from 'node:test';
import assert from 'node:assert/strict';
import {cacheKey,digestPdf} from '../lib/ai-runtime.mjs';
const hash='f'.repeat(64),model='gpt-4.1-mini';
const sanitizedModel=model.replace(/[^a-zA-Z0-9_-]/g,'_');
const oldKey=({school,grade,year,week})=>
 `v20/${school}/${grade}/${year}-${week}/${hash}-${sanitizedModel}.json`;

test('Wilds Minne grade 2 week 45 2026 bypasses the already populated AI blob',()=>{
 const k=cacheKey({school:'wildsminne',grade:'2',year:2026,week:45,hash,model});
 assert.notEqual(k,oldKey({school:'wildsminne',grade:'2',year:2026,week:45}));
 assert.equal(k,`v20-wildsminne-2-w45-refresh1/wildsminne/2/2026-45/${hash}-${sanitizedModel}.json`);
 assert.equal(cacheKey({school:'wildsminne',grade:'2',year:2026,week:45,hash,model}),k,
   'Identical source must share the new key, not retrigger AI on every request');
});

test('Do not invalidate other grades, schools or weeks',()=>{
 for(const item of [
  {school:'wildsminne',grade:'3',year:2026,week:45},
  {school:'wildsminne',grade:'2A',year:2026,week:45},
  {school:'wildsminne',grade:'2',year:2026,week:44},
  {school:'wildsminne',grade:'2',year:2026,week:46},
  {school:'wildsminne',grade:'2',year:2027,week:45},
  {school:'fagerholt',grade:'2',year:2026,week:45},
  {school:'sjostrand',grade:'2',year:2026,week:45},
 ]){
  assert.equal(cacheKey({...item,hash,model}),oldKey(item),JSON.stringify(item));
 }
});

test('A PDF content change still produces its own cache key after reset',()=>{
 const a=cacheKey({school:'wildsminne',grade:'2',year:2026,week:45,hash:digestPdf(Buffer.from('A')),model});
 const b=cacheKey({school:'wildsminne',grade:'2',year:2026,week:45,hash:digestPdf(Buffer.from('B')),model});
 assert.notEqual(a,b);
});
