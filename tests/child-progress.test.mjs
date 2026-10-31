import test from 'node:test';
import assert from 'node:assert/strict';
import {childTaskKey,checkedProgress,importCandidates} from '../public/barn/child-progress.mjs';
import {taskFingerprint as parentFingerprint} from '../public/shared/cloud-account.mjs';
import {scopedHomeworkItems} from '../public/barn/child-learning.mjs';

const child={id:'00000000-0000-4000-8000-000000000022',school:'fagerholt',grade:'3',group:'Rød'};
const calendar={year:2026,week:45};
const plan={parser:'ai',homework:[
 {text:'Forklar hva et adjektiv er',subject:'Norsk',group:'Rød',dueDay:'Torsdag'},
 {text:'Les to sider',subject:'Norsk',group:'Blå',dueDay:'Torsdag'},
 {text:'Les en bok',subject:'Norsk',group:'Rød',repeatDays:['Mandag','Onsdag']}
]};
test('Child uses bit-for-bit identical task fingerprint as guardian for normal and repeat homework',()=>{
 const own=scopedHomeworkItems(plan,child);
 assert.deepEqual(own.map(t=>t.index),[0,2,3]);
 for(const task of own){
  const expected=parentFingerprint({school:child.school,grade:child.grade,
   year:calendar.year,week:calendar.week,task});
  assert.equal(childTaskKey(child,calendar,task),expected);
  assert.match(expected,/^[a-f0-9]{16}$/);
 }
 assert.notEqual(childTaskKey(child,calendar,own[1]),childTaskKey(child,calendar,own[2]),
  'Repeated days have independent completion keys');
});
test('A parent-side explicit false blocks importing an old local true mark',()=>{
 const own=scopedHomeworkItems(plan,child),a=childTaskKey(child,calendar,own[0]);
 const b=childTaskKey(child,calendar,own[1]);
 const cloud=new Map([[a,false]]);
 const local={'0':true,'2':true};
 assert.deepEqual(importCandidates(own,child,calendar,cloud,local).map(x=>x.index),[2]);
 cloud.set(b,true);
 assert.deepEqual(importCandidates(own,child,calendar,cloud,local),[]);
});
test('Shared progress validates signed 16-hex keys and booleans',()=>{
 const key='a'.repeat(16);
 assert.deepEqual([...checkedProgress([{key,completed:false}])],[[key,false]]);
 assert.throws(()=>checkedProgress([{key:'not-a-task',completed:true}]),/Ugyldig/);
 assert.throws(()=>checkedProgress([{key,completed:'true'}]),/Ugyldig/);
 assert.throws(()=>checkedProgress({progress:[{key,completed:true}]}),/Ugyldig/);
});
