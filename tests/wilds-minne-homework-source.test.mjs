import test from 'node:test';
import assert from 'node:assert/strict';
import {extractHomeworkDeadlineCells} from '../lib/homework-grid.mjs';
import {reconcileHomeworkWithPdf} from '../lib/homework-source-truth.mjs';
import {normalizeAIPlan} from '../lib/ai-plan.mjs';
import {analyzePdfPages} from '../lib/plan-core.mjs';
import {expandHomework} from '../public/shared/homework-view.mjs';

// Reproduces the relevant visual structure (no school-specific hardcoded
// deadline rules). The actual PDF URL/content is NOT part of this fixture.
const tok=(text,x,y)=>({text,x,y,width:text.length*4});
const source=()=>[{width:1100,height:700,items:[
 tok('LEKSEPLAN UKE 45',60,115),
 tok('Mandag',120,152),tok('Tirsdag',325,152),tok('Onsdag',530,152),
 tok('Torsdag',735,152),tok('Fredag',940,152),
 tok('Matte: Gjør oppgave 8 og 9 i matteboka.',121,192),
 tok('Norsk: Les 10 minutter i leseboka.',326,192),
 tok('Norsk: Les 10 minutter i leseboka.',531,192),
 tok('Norsk: Les 10 minutter i leseboka.',736,192),
 tok('Ingen lekse',941,192),
 tok('Læringsmål',60,325),
 tok('Norsk: Vi lærer bokstavene denne uka',90,365)
]}];
const raw=()=>({days:[],attendance:[],dayNotes:[],homework:[],packing:[],
 notices:[],learningGoals:[],subjects:[],contacts:[],specialContent:[],
 vocabulary:[],weekTheme:{text:null,sourcePage:null,sourceQuote:''},
 optionalMission:{text:null,sourcePage:null,sourceQuote:''},
 coverage:{state:'complete',reason:'Kildetabell for lekser'}});
const meta=()=>({schoolId:'wildsminne',grade:'2',year:2026,week:45,
 source:'https://www.minskole.no/wildsminne/seksjon/22337',
 pdf:'https://www.minskole.no/example-lekseplan-uke-45.pdf',pageCount:1,
 pageLayouts:source(),pageTexts:[source()[0].items.map(x=>x.text).join(' ')]});
test('Source geometry: Wilds Minne-style day columns identify maths on Monday and Norwegian Tue–Thu',()=>{
 const tasks=extractHomeworkDeadlineCells(source());
 assert.deepEqual(tasks.map(t=>[t.subject,t.dueDay]),[
  ['Matte','Mandag'],['Norsk','Tirsdag'],['Norsk','Onsdag'],['Norsk','Torsdag']]);
 const verified=reconcileHomeworkWithPdf([],source());
 assert.equal(verified.verified,true);
 assert.equal(verified.homework.length,2);
 const math=verified.homework.find(t=>t.subject==='Matte');
 const norsk=verified.homework.find(t=>t.subject==='Norsk');
 assert.equal(math.dueDay,'Mandag');
 assert.deepEqual(math.repeatDays,[]);
 assert.equal(norsk.dueDay,null);
 assert.deepEqual(norsk.repeatDays,['Tirsdag','Onsdag','Torsdag']);
 assert.deepEqual(expandHomework(verified.homework).map(t=>t.repeatDay||t.dueDay),[
  'Mandag','Tirsdag','Onsdag','Torsdag']);
});
test('AI and fallback agree on the source-verified deadlines, not generated weekdays',()=>{
 const plan=normalizeAIPlan(raw(),meta());
 const rules=analyzePdfPages(source(),'2',meta().pdf,45,2026,meta().source);
 for(const actual of [plan,rules]){
  assert.equal(actual.homework.length,2);
  assert.equal(actual.homework.find(t=>t.subject==='Matte')?.dueDay,'Mandag');
  assert.deepEqual(actual.homework.find(t=>t.subject==='Norsk')?.repeatDays,
   ['Tirsdag','Onsdag','Torsdag']);
 }
});
test('Unlabelled timetable weekdays cannot create homework',()=>{
 const timetable=source();
 timetable[0].items=timetable[0].items.filter(x=>x.text!=='LEKSEPLAN UKE 45');
 assert.deepEqual(extractHomeworkDeadlineCells(timetable),[]);
 assert.equal(reconcileHomeworkWithPdf([{subject:'Norsk',text:'Les i boka',dueDay:null}],timetable).verified,false);
});
test('Another school with only a regular weekday timetable stays untouched',()=>{
 const pages=[{width:1100,height:550,items:[
  tok('UKEPLAN UKE 45',45,80),
  ...['Mandag','Tirsdag','Onsdag','Torsdag','Fredag']
   .map((d,i)=>tok(d,120+i*205,120)),
  tok('Norsk: Vi øver på bokstaver',325,170),
  tok('Matte: Addisjon i timen',120,175)
 ]}];
 assert.deepEqual(extractHomeworkDeadlineCells(pages),[]);
});
