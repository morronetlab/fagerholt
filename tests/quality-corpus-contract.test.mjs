import test from 'node:test';
import assert from 'node:assert/strict';
import {QUALITY_CORPUS_VERSION,QUALITY_REFERENCE_CASES} from './quality/corpus-v1.mjs';

const TIERS=new Set(['reconstructed-layout','indexed-text-only','synthetic-negative']);
const EXPECTATION_KINDS=new Set(['homework','exclude_homework','packing','day_note','notice','homework_empty']);
test('Quality reference corpus contains traceable, independent school layouts',()=>{
 assert.equal(QUALITY_CORPUS_VERSION,1);
 assert.ok(QUALITY_REFERENCE_CASES.length>=5);
 assert.ok(new Set(QUALITY_REFERENCE_CASES.map(c=>c.id)).size===QUALITY_REFERENCE_CASES.length);
 assert.ok(new Set(QUALITY_REFERENCE_CASES.map(c=>c.source.school)).size>=4);
 for(const sample of QUALITY_REFERENCE_CASES){
  assert.match(sample.id,/^[a-z0-9-]+$/);
  assert.ok(TIERS.has(sample.evidenceTier),sample.id);
  assert.ok(sample.title.length>=12&&sample.source.reference&&sample.source.scope.length>20);
  assert.ok(sample.source.school&&sample.source.grade);
  assert.ok(Number.isInteger(sample.source.week)&&sample.source.week>=1&&sample.source.week<=53);
  assert.ok(Number.isInteger(sample.source.year)||sample.source.year===null);
  assert.ok(Array.isArray(sample.input.pages)&&sample.input.pages.length>0);
  assert.ok(Array.isArray(sample.expectations)&&sample.expectations.length>0);
  for(const p of sample.input.pages){
   assert.ok(p.width>0&&p.height>0&&Array.isArray(p.items));
   for(const token of p.items)assert.ok(typeof token.text==='string'&&Number.isFinite(token.x)&&Number.isFinite(token.y)&&Number.isFinite(token.width));
  }
  for(const item of sample.expectations){
   assert.ok(EXPECTATION_KINDS.has(item.kind),sample.id+': '+item.kind);
   if(item.repeatDays)assert.ok(item.repeatDays.every(d=>['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'].includes(d)));
   if(['packing','day_note'].includes(item.kind))assert.ok(['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'].includes(item.day));
  }
  if(sample.evidenceTier==='synthetic-negative')assert.equal(sample.source.pdfUrl,null);
  if(sample.source.pdfUrl)assert.match(sample.source.pdfUrl,/^https:\/\/www\.minskole\.no\/DynamicContent\//);
 }
});
test('All reference cases have explicit evidence limitations; no private family data',()=>{
 const serialized=JSON.stringify(QUALITY_REFERENCE_CASES);
 assert.doesNotMatch(serialized,/"(?:childId|familyId|userId|accessToken|authToken|emailAddress)"\s*:/i);
 assert.ok(QUALITY_REFERENCE_CASES.some(c=>c.evidenceTier==='indexed-text-only'));
 assert.ok(QUALITY_REFERENCE_CASES.some(c=>c.evidenceTier==='synthetic-negative'));
 assert.ok(QUALITY_REFERENCE_CASES.filter(c=>c.evidenceTier==='reconstructed-layout').length>=3);
 assert.ok(QUALITY_REFERENCE_CASES.every(c=>/\b(?:PDF|text|layout|binary)\b/i.test(c.source.scope)));
});
