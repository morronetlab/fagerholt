import test from 'node:test';
import assert from 'node:assert/strict';
import {familyNoticePreview} from '../public/shared/family-important-notices.mjs';

const note=(title,{important=false,kind='school',date=null,scope='Ailin'}={})=>({
 key:'n-'+title,kind,date,title,scope,important,source:{url:'https://www.minskole.no/test.pdf'}
});
const agenda=(items,missingProfiles=['Maya'])=>({
 days:[{date:'2026-11-09',items}],undated:[],missingProfiles
});

test('No important notes: ordinary original-PDF school messages fill the first cards',()=>{
 const model=agenda([
  note('Ta med leseboka på mandag'),
  note('Ukas beskjed om foreldremøte'),
  {kind:'family',title:'Lørdagsfotball',important:false},
  {kind:'homework',title:'Les ti minutter',important:false}
 ]);
 const result=familyNoticePreview(model,{limit:3});
 assert.equal(result.mode,'school-notices');
 assert.equal(result.total,2);
 assert.deepEqual(result.visible.map(x=>x.title),
  ['Ta med leseboka på mandag','Ukas beskjed om foreldremøte']);
 assert.equal(model.missingProfiles.length,1,'A missing second child is not evidence that all PDFs failed');
});

test('Critical announcements always take precedence over ordinary messages',()=>{
 const model=agenda([note('Les en bok'),note('Vaksinasjon mandag',{important:true})]);
 const result=familyNoticePreview(model);
 assert.equal(result.mode,'important');
 assert.equal(result.visible.length,1);
 assert.match(result.visible[0].title,/Vaksinasjon/);
});

test('Undated source-backed notices appear before a misleading empty state',()=>{
 const result=familyNoticePreview({days:[],undated:[
  note('Husk praktisk beskjed fra skolen')
 ],missingProfiles:['Maya']});
 assert.equal(result.mode,'school-notices');
 assert.equal(result.visible.length,1);
 assert.equal(result.visible[0].date,null);
});

test('Repeated notices shared between siblings have one preview card and both scopes',()=>{
 const result=familyNoticePreview(agenda([
  note('Skoledagen starter senere',{scope:'Ailin'}),
  note('Skoledagen starter senere',{scope:'Maya'})
 ]));
 assert.equal(result.visible.length,1);
 assert.equal(result.visible[0].scope,'Ailin, Maya');
});

test('Homework or family events alone are NOT presented as school announcements',()=>{
 const result=familyNoticePreview(agenda([
  {kind:'homework',title:'Les side 12',important:false},
  {kind:'family',title:'Spond trening',important:false}
 ]));
 assert.equal(result.total,0);
 assert.deepEqual(result.visible,[]);
});
