import test from 'node:test';
import assert from 'node:assert/strict';
import {correctWildsMinneWeek45Homework as correct} from '../lib/wildsminne-week45-homework.mjs';
import {expandHomework} from '../public/shared/homework-view.mjs';

const source=()=>({
 schoolId:'wildsminne',grade:'2',week:45,year:2026,status:'ok',parser:'ai',aiStatus:'ready',
 homeworkSourceVersion:1,homeworkDayColumnsVersion:1,
 homework:[
  {subject:'Norsk',text:'Les i bok i sekken 10-15 min.',dueDay:null,repeatDays:[],group:null},
  {subject:'Matte',text:'Tell til hundre – hva skjer med tallet når det består av to siffer? (Det består av en mengde tiere og en mengde enere). Bruk gjerne penger eller andre konkreter hjemme.',dueDay:null,repeatDays:[],group:null},
 ]
});
test('Known week 45 tasks get their guardian-confirmed days even with already-migrated AI cache',()=>{
 const p=source(),result=correct(p);
 assert.notEqual(result,p);
 assert.equal(result.homework.length,2);
 assert.equal(result.homework[0].dueDay,null);
 assert.deepEqual(result.homework[0].repeatDays,['Tirsdag','Onsdag','Torsdag']);
 assert.equal(result.homework[1].dueDay,'Mandag');
 assert.deepEqual(result.homework[1].repeatDays,[]);
 assert.deepEqual(expandHomework(result.homework).map(item=>item.repeatDay||item.dueDay),[
  'Tirsdag','Onsdag','Torsdag','Mandag'
 ]);
 assert.deepEqual(p.homework.map(x=>x.repeatDays),[[],[]],
  'Do not mutate the shared cached plan');
 assert.equal(correct(result),result,'Reapplying the correction must be idempotent');
});
test('Same homework texts at other schools, grades, years and weeks are untouched',()=>{
 for(const overrides of [
  {schoolId:'fagerholt'},{schoolId:'sjostrand'},{grade:'3'},{grade:'2A'},
  {week:44},{week:46},{year:2025},{year:2027},{status:'unpublished'}
 ]){
  const input={...source(),...overrides};
  assert.equal(correct(input),input,JSON.stringify(overrides));
 }
});
test('No correction when either exact assignment is changed, missing or group-scoped',()=>{
 const p=source();
 for(const homework of [
  p.homework.slice(0,1),
  p.homework.slice(1),
  [{...p.homework[0],text:'Les i bok hjemme 15 minutter'},p.homework[1]],
  [p.homework[0],{...p.homework[1],text:'Gjør oppgaver om klokka'}],
  [{...p.homework[0],group:'Rød'},p.homework[1]],
  [p.homework[0],{...p.homework[1],group:'Blå'}],
  [p.homework[0],p.homework[0],p.homework[1]],
 ]){
  const input={...p,homework};
  assert.equal(correct(input),input,'No guess for incomplete or ambiguous evidence');
 }
});
test('Other homework and progress metadata stay unchanged',()=>{
 const p=source(),extra={subject:'Engelsk',text:'Gjør oppgave på side 14',dueDay:'Fredag',repeatDays:[]};
 p.homework.push(extra);p.provenance=[{sourcePage:1,sourceQuote:'Lekser'}];p.schoolName='Wilds Minne skole';
 const result=correct(p);
 assert.equal(result.homework[2],extra);
 assert.equal(result.provenance,p.provenance);
 assert.equal(result.schoolName,p.schoolName);
});
