import test from 'node:test';
import assert from 'node:assert/strict';
import {
 scopedHomeworkItems,scopedPackingItems,childSchoolDayDetails,
 childCheckedKey,readChildChecks,setChildCheck,homeworkItemKey
} from '../public/barn/child-learning.mjs';
import {quizItems,buildQuizRounds} from '../public/shared/word-quiz-core.mjs';
const red={id:'00000000-0000-4000-8000-000000000022',name:'Barn A',school:'fagerholt',grade:'3',group:'Rød'};
const blue={...red,id:'00000000-0000-4000-8000-000000000023',group:'Blå'};
const plan={parser:'ai',
 homework:[
  {subject:'Norsk',text:'Forklar hvorfor',dueDay:'Torsdag',group:'Rød'},
  {subject:'Matte',text:'Øv på gangetabellen',group:'Blå'},
  {subject:'Engelsk',text:'Les en bok',repeatDays:['Mandag','Fredag'],group:'Rød'},
  {subject:'Norsk',text:'Skriv og les',group:'Rød'}
 ],
 everyday:[{label:'Blyant',group:'Rød'}],
 days:{Onsdag:{
  bring:[{label:'Gymtøy',group:'Blå'},{label:'Husk boken',group:'Rød'}],
  events:[
   {title:'Lesestund',time:'09:00',group:'Rød'},
   {title:'Matematikk',time:'09:00',group:'Blå'},
   {title:'Felles tur',time:'12:00'}
  ]
 }},
 dayNotes:{Onsdag:[{text:'Rød gruppe skal på biblioteket',group:'Rød'},
  {text:'Blå gruppe skal i gymsal',group:'Blå'}]},
 attendance:[{day:'Onsdag',group:'Rød',time:'08:45',text:'Oppmøte på biblioteket'},
 {day:'Onsdag',group:'Blå',time:'09:00',text:'Oppmøte gymsal'}]
};
test('Child sees documented due weekdays and repeated homework while retaining stable source indices',()=>{
 const r=scopedHomeworkItems(plan,red),b=scopedHomeworkItems(plan,blue);
 assert.deepEqual(r.map(x=>x.index),[0,2,3,4]);
 assert.deepEqual(b.map(x=>x.index),[1]);
 assert.equal(r[0].dueLabel,'Til torsdag');
 assert.equal(r[1].dueLabel,null,'Repeated weekdays do not invent a deadline');
 assert.equal(r[1].repeatLabel,'📖 Mandag – daglig oppgave');
 assert.equal(r[2].repeatLabel,'📖 Fredag – daglig oppgave');
 assert.equal(r[3].dueLabel,null,'AI tasks with no verified date must not infer one');
 assert.notEqual(homeworkItemKey(r[0]),homeworkItemKey(r[1]));
});
test('Daily detail retains class group labels, timed simultaneous entries and documented attendance',()=>{
 const d=childSchoolDayDetails(plan,red,'Onsdag');
 assert.equal(d.own.length,2);
 assert.equal(d.own[0].entries[0].group,'Rød');
 assert.equal(d.other[0].entries[0].group,'Blå');
 assert.equal(d.attendance.length,1);
 assert.match(d.attendance[0].text,/biblioteket/);
 assert.equal(d.notes.length,1);
 assert.match(d.notes[0].text,/Rød gruppe/);
});
test('Child packing only contains their group and deduplicates everyday material',()=>{
 const x=scopedPackingItems(plan,red,'Onsdag');
 assert.deepEqual(x.map(a=>a.label),['Blyant','Husk boken']);
 assert.equal(scopedPackingItems(plan,blue,'Onsdag').length,1);
});
test('Local checklists are isolated by child, week, list type and day, and survive reload',()=>{
 const db=new Map(),storage={getItem:k=>db.get(k)||null,setItem:(k,v)=>db.set(k,v)};
 const redHw=childCheckedKey(red,2026,44,'homework');
 const blueHw=childCheckedKey(blue,2026,44,'homework');
 const redNext=childCheckedKey(red,2026,45,'homework');
 const bag=childCheckedKey(red,2026,44,'bag','Onsdag');
 assert.notEqual(redHw,blueHw);assert.notEqual(redHw,redNext);assert.notEqual(redHw,bag);
 setChildCheck(storage,redHw,'0',true);
 setChildCheck(storage,bag,'Blyant|rød',true);
 assert.deepEqual(readChildChecks(storage,redHw),{'0':true});
 assert.deepEqual(readChildChecks(storage,bag),{'Blyant|rød':true});
 assert.deepEqual(readChildChecks(storage,blueHw),{});
 setChildCheck(storage,redHw,'0',false);
 assert.deepEqual(readChildChecks(storage,redHw),{'0':false});
 assert.throws(()=>childCheckedKey(red,2026,44,'guardian'),/Ugyldig liste/);
});
test('Existing quiz engine recognizes sourced vocabulary for English and Norwegian',()=>{
 const vocab=[{category:'engelske gloser',text:'apple - eple; dog - hund'},
  {category:'norske øveord',text:'skole, sol'}];
 const all=quizItems(vocab);
 assert.ok(all.some(x=>x.language==='en'&&x.translation==='eple'));
 assert.ok(all.some(x=>x.language==='nb'&&x.word==='skole'));
 assert.ok(buildQuizRounds(all,'en').length>0);
 assert.ok(buildQuizRounds(all,'nb').length>0);
});
