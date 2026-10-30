import test from 'node:test';
import assert from 'node:assert/strict';
import {explicitPackingInPdf,isSyntheticPackingNotice,stripSyntheticPackingNotices}
 from '../lib/packing-source.mjs';

test('The actual PDF must contain a concrete instruction about the exact item',()=>{
 const source='På fredag skal vi på tur. Husk å ta med refleksvest og drikkeflaske.';
 assert.equal(explicitPackingInPdf('Refleksvest','Husk å ta med refleksvest',source),true);
 assert.equal(explicitPackingInPdf('Engelskboka','Husk å ta med engelskboka',source),false);
 assert.equal(explicitPackingInPdf('Refleks','Vi skal på tur på fredag',source),false);
 assert.equal(explicitPackingInPdf('Refleks','Husk refleks',''),false);
 assert.equal(explicitPackingInPdf('Gymtøy','Husk å ta med gymklær', 'Vi minner om: Husk å ta med gymklær til torsdag.'),true);
});
test('A generic remember-note in another sentence does not validate phantom gear',()=>{
 const page='Ta med gymtøy til fredag. Vi skal bruke engelskboka i norsktimen.';
 const quote='Ta med gymtøy til fredag. Vi skal bruke engelskboka i norsktimen.';
 assert.equal(explicitPackingInPdf('Engelskboka',quote,page),false);
 assert.equal(explicitPackingInPdf('Gymtøy','Ta med gymtøy til fredag.',page),true);
 assert.equal(explicitPackingInPdf('Refleks','Ta med refleks.',page),false);
});
test('Historic parser-generated packing notices and inferred gear are removed without another AI call',()=>{
 const marker='Ta med: Refleks (sjekk hvilken dag i PDF-en)';
 const second='Ta med: Engelskboka (sjekk hvilken dag i PDF-en)';
 assert.equal(isSyntheticPackingNotice(marker),true);
 assert.equal(isSyntheticPackingNotice(second),true);
 assert.equal(isSyntheticPackingNotice('Ta med refleks på fredag.'),false);
 const cached={aiStatus:'ready',parser:'ai',week:45,notices:[
  marker,{text:second,group:'Rød gruppe'},'Foreldremøte på torsdag'],
  everyday:[{label:'Håndkle',note:'Forslag ut fra aktivitet i PDF-en'},{label:'Kostyme'}],
  days:{Mandag:{events:[],bring:[
   {label:'Refleks',note:'Forslag ut fra aktivitet i PDF-en'},{label:'Gymtøy'}]}}
 };
 const result=stripSyntheticPackingNotices(cached);
 assert.deepEqual(result.notices,['Foreldremøte på torsdag']);
 assert.deepEqual(result.everyday,[{label:'Kostyme'}]);
 assert.deepEqual(result.days.Mandag.bring,[{label:'Gymtøy'}]);
 assert.equal(cached.notices.length,3,'Do not mutate blobs that may be shared by other requests');
 assert.equal(stripSyntheticPackingNotices(result),result,'Sanitizing an already-clean plan is free');
});
