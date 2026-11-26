import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileHomeworkWithPdf,extractHomeworkEvidenceCells} from '../lib/homework-source-truth.mjs';

const token=(text,x,y)=>({text,x,y,width:text.length*5});
const pages=[{width:800,height:600,items:[
 token('Lekser',20,20),
 token('Til tirsdag',20,50),token('Norsk: Les teksten om vulkaner',180,65),
 token('Til torsdag',20,150),token('Matte: Regn oppgavene i arbeidsboka',180,165),
 token('Beskjeder',20,240)
]}];
test('Identical source-backed homework for different groups survives reconciliation',()=>{
 assert.ok(extractHomeworkEvidenceCells(pages).length>=2,'fixture must exercise reconciliation');
 const task={subject:'Norsk',text:'Les teksten om vulkaner',dueDay:'Tirsdag',sourcePage:1};
 const result=reconcileHomeworkWithPdf([
  {...task,group:'Rød'}, {...task,group:'Grønn'}, {...task,group:'Rød'}
 ],pages);
 assert.equal(result.verified,true);
 const reading=result.homework.filter(x=>x.text.includes('vulkaner'));
 assert.deepEqual(reading.map(x=>x.group).sort(),['Grønn','Rød']);
});
test('Same text with different repeated-day patterns remains distinct',()=>{
 const task={subject:'Engelsk',text:'Øv på engelske gloser',dueDay:null,group:'Blå'};
 const result=reconcileHomeworkWithPdf([
  {...task,repeatDays:['Mandag','Onsdag']},
  {...task,repeatDays:['Tirsdag','Fredag']}
 ],pages);
 assert.equal(result.homework.filter(x=>x.group==='Blå').length,2);
});
