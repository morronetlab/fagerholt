import test from 'node:test';
import assert from 'node:assert/strict';
import {extractHomeworkSharedDeadline,sourceRows} from '../lib/homework-shared-deadline.mjs';
import {analyzePdfPages} from '../lib/plan-core.mjs';
const t=(text,x,y)=>({text,x,y,width:text.length*4});
const page=(items)=>({width:590,height:840,items});
const sample=page([
 t('LEKSER',55,230),
 t('Norsk: Les side 135 i boka.',55,260),
 t('Matte: Matteark med divisjon',55,290),
 t('Engelsk: Øv på gloser',55,319),
 t('Alle lekser leveres senest onsdag.',55,358),
 t('Planleggingsdager torsdag og fredag',55,375),
 t('Kontaktlærer',55,700)
]);
test('P1: reviewed source pattern: independent reading, math and vocabulary inherit explicit Wednesday cutoff',()=>{
 const tasks=extractHomeworkSharedDeadline([sample]);
 assert.deepEqual(tasks.map(x=>x.dueDay),['Onsdag','Onsdag','Onsdag']);
 assert.equal(tasks.length,3);
 assert.ok(tasks.every(x=>x.sourcePage===1&&x.evidence==='explicit-shared-homework-deadline'));
 assert.ok(tasks.some(x=>x.text.includes('side 135')));
 assert.ok(tasks.some(x=>x.text.includes('Matteark med divisjon')));
 assert.ok(tasks.some(x=>x.text.includes('gloser')));
 assert.ok(!tasks.some(x=>/Planleggingsdager|Kontaktlærer/i.test(x.text)));
});
test('Fallback plan uses only PDF-backed common due date, without converting notices into homework',()=>{
 const plan=analyzePdfPages([sample],'4','https://www.minskole.no/example.pdf',45,2026,'https://www.minskole.no/example/');
 assert.ok(plan.homework.some(x=>/side 135/i.test(x.text)&&x.dueDay==='Onsdag'));
 assert.ok(plan.homework.some(x=>/Matteark med divisjon/i.test(x.text)&&x.dueDay==='Onsdag'));
 assert.ok(plan.homework.some(x=>/gloser/i.test(x.text)&&x.dueDay==='Onsdag'));
 assert.ok(!plan.homework.some(x=>/Planleggingsdager|Kontaktlærer/i.test(x.text)));
});
test('No explicit day, no homework title or contradictory weekday must never create a deadline',()=>{
 const cases=[
  page(sample.items.filter(x=>!x.text.includes('leveres senest'))),
  page(sample.items.filter(x=>x.text!=='LEKSER')),
  page([...sample.items,t('Lekser leveres senest torsdag',55,360)]),
  page(sample.items.map(x=>x.text.includes('Alle lekser leveres')?{...x,text:'Neste uke leveres senest onsdag'}:x))
 ];
 for(const p of cases)assert.deepEqual(extractHomeworkSharedDeadline([p]),[]);
});
test('Separate PDF pages never share their heading and deadline',()=>{
 assert.deepEqual(extractHomeworkSharedDeadline([page([t('LEKSER',55,100),t('Les side 135',55,125)]),
  page([t('Leveres senest onsdag',55,100)])]),[]);
});
test('PDF.js fragments on one baseline are joined without copying unrelated right-column text',()=>{
 const rows=sourceRows(page([t('Matteark',55,250),t('med divisjon',99,250),
  t('Gym på skolen',420,250)]));
 assert.equal(rows.length,2);
 assert.match(rows[0].text,/Matteark med divisjon/);
 assert.equal(rows[1].text,'Gym på skolen');
});

test('Shared deadline on the same heading line is source evidence, not a second invented task',()=>{
 const source=page([t('LEKSER som leveres senest onsdag',45,60),
  t('Norsk: Les side 135 i boka.',185,95),
  t('Matte: Matteark med divisjon',162,157),
  t('Engelsk: Øv på gloser',162,194)]);
 const tasks=extractHomeworkSharedDeadline([source]);
 assert.deepEqual(tasks.map(x=>x.dueDay),['Onsdag','Onsdag','Onsdag']);
 assert.equal(tasks.length,3);
});

test('Source-explicit reading page in a narrative sentence is homework; bringing a book is not',()=>{
 const p=page([t('LEKSER som leveres senest onsdag',45,60),
  t('Norsk: I norskboka skal du lese side 135.',175,93),
  t('Husk å ta med en bok fra side 135.',170,120)]);
 const tasks=extractHomeworkSharedDeadline([p]);
 assert.equal(tasks.length,1);
 assert.equal(tasks[0].dueDay,'Onsdag');
 assert.match(tasks[0].text,/side 135/);
});

test('Husk å øve på gloser is homework, while husk å ta med is packing',()=>{
 const p=page([t('LEKSER som leveres senest onsdag',45,60),
  t('Engelsk: Husk å øve på gloser',160,190),
  t('Husk å ta med gymsko',160,222)]);
 const tasks=extractHomeworkSharedDeadline([p]);
 assert.equal(tasks.length,1);
 assert.match(tasks[0].text,/gloser/);
});
