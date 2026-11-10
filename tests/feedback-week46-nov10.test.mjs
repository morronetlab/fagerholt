import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedSchoolPacking,mergeVerifiedPacking} from '../lib/source-gear-evidence.mjs';
import {extractHomeworkDaySections} from '../lib/homework-day-sections.mjs';
import {reconcileHomeworkWithPdf} from '../lib/homework-source-truth.mjs';
import {uniqueDayEvents} from '../public/shared/day-view.mjs';
import {refreshCachedEvidence,needsCachedEvidenceRefresh} from '../lib/plan-cache-evidence.mjs';
const token=(text,x,y)=>({text,x,y,width:text.length*4});
const emptyDays=()=>Object.fromEntries(['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'].map(day=>
 [day,{events:[],bring:[]}]));

test('Lovisenlund day column explicitly requires Thursday gym clothes and towel, but not unmentioned soap',()=>{
 const page={width:590,height:840,items:[
  ...['MANDAG','TIRSDAG','ONSDAG','TORSDAG','FREDAG'].map((s,i)=>token(s,[69,171,271,373,487][i],426)),
  token('Gruppe 1 og 2:',364,510),
  token('Gym på skolen.',362,520),
  token('HUSK',358,541),token('GYMTØY.',391,541),
  token('HUSK HÅNDKLE',360,551),token('TIL DUSJ',376,561)
 ]};
 const items=verifiedSchoolPacking([page]);
 assert.deepEqual(items.map(x=>[x.day,x.label]),[
  ['Torsdag','Gymtøy'],['Torsdag','Håndkle']]);
 assert.equal(items.some(x=>/Såpe/.test(x.label)),false);
 assert.deepEqual(mergeVerifiedPacking(emptyDays(),items).Torsdag.bring,
  [{label:'Gymtøy'},{label:'Håndkle'}]);
});
test('Do not invent daily gear from ordinary timetable mention of gym',()=>{
 const page={width:590,height:840,items:[
  ...['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'].map((s,i)=>token(s,[69,171,271,373,487][i],426)),
  token('Gym på skolen.',362,520),token('Vi trenger utstyr i gym.',361,535)
 ]};
 assert.deepEqual(verifiedSchoolPacking([page]),[]);
});
test('Hellemyr source homework columns yield equipment, including Thursday books and Friday Flaskeposten',()=>{
 const page={width:595,height:840,items:[
  token('Til tirsdag',40,478),token('Til onsdag',170,478),
  token('Til torsdag',310,478),token('Til fredag',452,478),
  token('Les side 44-45 i Zeppelin lesebok.',37,504),
  token('Ta med blyant og',37,740),token('viskelær hver',37,756),token('eneste dag',37,771),
  token('Les side 48-49 i Zeppelin lesebok.',310,505),
  token('Ta med Zeppelin og',310,581),token('skriveboka tilbake på',310,597),
  token('skolen',310,612),
  token('Les 15 minutter i biblioteksbok.',452,505),
  token('Husk Flaskeposten',452,643),token('med en koselig',452,658),
  token('kommentar.',452,673)
 ]};
 const items=verifiedSchoolPacking([page]);
 assert.ok(items.some(x=>x.day==='Torsdag'&&x.label==='Zeppelin lesebok'));
 assert.ok(items.some(x=>x.day==='Torsdag'&&x.label==='Skrivebok'));
 assert.ok(items.some(x=>x.day==='Fredag'&&x.label==='Flaskeposten'));
 assert.ok(items.some(x=>x.day==='Mandag'&&x.label==='Blyant'));
 assert.ok(items.some(x=>x.day==='Fredag'&&x.label==='Viskelær'));
});
test('Wilds Minne split LEKSER heading and split Norsk colon retain Tue–Thu reading assignments',()=>{
 const page={width:590,height:850,items:[
  token('L',274,385),token('ekser',281,385),
  token('Mandag',77,405),token('Tirsdag',77,493),
  token('Onsdag',77,523),token('Torsdag',77,553),token('Fredag',77,584),
  ...[405,493,523,553].flatMap(y=>[
   token('Norsk',153,y),token(':',183,y),
   token('Les i bok i sekken 10',189,y),token('-',287,y),
   token('15.min.',291,y)
  ]),
  token('Matte:',153,419),token('Tell til hundre.',190,419)
 ]};
 const cells=extractHomeworkDaySections([page]);
 const norsk=cells.filter(x=>x.subject?.toLowerCase()==='norsk');
 assert.deepEqual(norsk.map(x=>x.dueDay),['Mandag','Tirsdag','Onsdag','Torsdag']);
 const merged=reconcileHomeworkWithPdf([],[page]).homework;
 assert.ok(merged.some(x=>['Tirsdag','Onsdag','Torsdag'].every(d=>
  x.repeatDays?.includes(d))));
});
test('Standalone time and whitespace-only day events do not create empty icon rows',()=>{
 const events=uniqueDayEvents([
  {title:'',time:null},{title:'   ',time:'08.00'},
  {title:'',time:null},{title:'Gym på skolen.',time:'09.00'}
 ]);
 assert.equal(events.length,1);
 assert.equal(events[0].title,'Gym på skolen.');
});
test('Already cached AI plans recover Friday source gym shoes without changing original cached object',()=>{
 const page={width:800,height:700,items:[
  token('Lekser til tirsdag',91,373),token('Lekser til onsdag',306,373),
  token('Lekser til torsdag',501,373),token('Lekser til fredag',687,373),
  token('Norsk: Les i Fabel.',27,403),
  token('Øv på å telle oppover til 40.',247,404),
  token('Øv på å telle oppover til 40.',459,404),
  token('Ta med gymsko.',639,404),
  token('Kontaktlærere:',27,523)
 ]};
 const old={schoolId:'sjostrand',grade:'2',week:46,year:2026,parser:'ai',
  feedbackSourceRepairVersion:1,homeworkSourceVersion:3,
  sourceAudit:{status:'ok'},digestPracticalEvidenceVersion:1,
  homework:[],days:emptyDays(),notices:[],everyday:[]};
 assert.equal(needsCachedEvidenceRefresh(old),true);
 const next=refreshCachedEvidence(old,[page]).plan;
 assert.ok(next.days.Fredag.bring.some(x=>x.label==='Gymsko'));
 assert.equal(next.feedbackSourceRepairVersion,2);
 assert.deepEqual(old.days.Fredag.bring,[]);
});
