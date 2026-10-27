import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePdfPages} from '../lib/plan-core.mjs';
const token=(text,x,y)=>({text,x,y,width:Math.min(115,text.length*4)});
const page=items=>({width:830,height:850,items});
const parse=(pages,grade)=>analyzePdfPages(pages,grade,'https://www.minskole.no/test.pdf',44,2026,'https://www.minskole.no/fagerholt');
const headings=()=>['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'].map((day,i)=>token(day,20+i*156,55));

test('3rd grade: wrapped sentences are one event, but another subject starts a new row',()=>{
 const items=[...headings(),token('Norsk: I dag skal vi',20,88),token('lese og øve på',24,101),
 token('lydene sammen.',24,114),token('Matte: addisjon',20,147)];
 const data=parse([page(items)],'3');
 assert.equal(data.layout,'five-columns');
 assert.equal(data.days.Mandag.events.length,2);
 assert.match(data.days.Mandag.events[0].title,/I dag skal vi lese og øve på lydene sammen/);
});
test('7th grade: multi-line subject in Friday column is not multiple events',()=>{
 const x=20+4*156;
 const data=parse([page([...headings(),token('Samfunnsfag: Vi jobber',x,86),
 token('videre med demokrati',x+4,100),token('og valg denne uken.',x+4,114),token('Engelsk: gloser',x,148)])],'7');
 assert.equal(data.days.Fredag.events.length,2);
 assert.match(data.days.Fredag.events[0].title,/Vi jobber videre med demokrati og valg denne uken/);
});
test('4th grade: due-date groups combine multiple assignments but preserve other due dates',()=>{
 const items=[token('Lekser og oppgaver',20,15),token('Til torsdag:',20,43),
 token('Norsk:',20,65),token('Les kapittel 4.',20,82),
 token('Matte: Regn side 37.',20,110),token('Til fredag:',20,149),
 token('Engelsk: Lær glosene.',20,173)];
 const data=parse([page(items)],'4');
 assert.equal(data.homework.length,2);
 assert.equal(data.homework[0].subject,'Til torsdag');
 assert.match(data.homework[0].text,/Norsk: Les kapittel/);
 assert.match(data.homework[0].text,/Matte: Regn side/);
 assert.equal(data.homework[1].subject,'Til fredag');
});
test('3rd grade: swimming noted Tuesday provides suggested swimwear Tuesday only',()=>{
 const data=parse([page([...headings(),token('Svømming i svømmehallen',20+156,98)])],'3');
 assert.ok(data.days.Tirsdag.bring.some(x=>x.label==='Badetøy'&&x.note));
 assert.ok(data.days.Tirsdag.bring.some(x=>x.label==='Håndkle'));
 assert.deepEqual(data.days.Mandag.bring,[]);
});
test('costume reminder in PDF for Friday is not a fixed Halloween date',()=>{
 const items=[token('Beskjeder fra skolen',22,25),token('Fredag skal vi ha halloweenfeiring',22,55),
 token('Husk å komme utkledd i kostyme.',22,70)];
 const data=parse([page(items)],'3');
 assert.ok(data.days.Fredag.bring.some(x=>x.label==='Kostyme'));
 assert.deepEqual(data.days.Torsdag.bring,[]);
});
test('Halloween by itself does not invent a costume requirement',()=>{
 const data=parse([page([token('Beskjeder fra skolen',20,20),token('Fredag er det Halloween-feiring.',20,45)])],'3');
 assert.deepEqual(data.days.Fredag.bring,[]);
});
test('group-only swimming and negated gear do not apply to all students',()=>{
 const data=parse([page([...headings(),token('Rød gruppe har svømming',20,100),
 token('Husk ikke badetøy i dag',20+156,100)])],'3');
 assert.deepEqual(data.days.Mandag.bring,[]);
 assert.deepEqual(data.days.Tirsdag.bring,[]);
});
test('explicit badetøy must not be labeled as an inferred suggestion',()=>{
 const data=parse([page([...headings(),token('Svømming – husk badetøy',20+2*156,100)])],'3');
 const item=data.days.Onsdag.bring.find(x=>x.label==='Badetøy');
 assert.ok(item);
 assert.equal(item.note,undefined);
});
