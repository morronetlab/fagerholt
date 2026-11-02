import test from 'node:test';
import assert from 'node:assert/strict';
import {extractHomeworkDaySections} from '../lib/homework-day-sections.mjs';
import {extractHomeworkEvidenceCells,reconcileHomeworkWithPdf,HOMEWORK_SOURCE_VERSION} from '../lib/homework-source-truth.mjs';
import {refreshCachedEvidence,needsCachedEvidenceRefresh} from '../lib/plan-cache-evidence.mjs';
import {expandHomework} from '../public/shared/homework-view.mjs';
import {analyzePdfPages} from '../lib/plan-core.mjs';
import {correctWildsMinneWeek45Homework} from '../lib/wildsminne-week45-homework.mjs';

// Faithful page-1 layout fixture based on the actual, independently inspected
// official Wilds Minne PDF: title spans the table, Monday has two assignments
// and a left-column field-trip note, weekdays are aligned with homework text
// on the SAME baseline, and "Info / LESELEKSE" follows the Friday row.
// These are PDF.js-like coordinates, not an artificial day-on-a-new-line plan.
const token=(text,x,y)=>({text,x,y,width:Math.min(410,text.length*4)});
function officialLayout(){
 return [{width:600,height:850,items:[
  token('LEKSEPLAN 2. TRINN, UKE 45',180,76),
  token('LÆRINGSMÅL:',200,125),
  token('Jeg kan telle til hundre.',150,157),
  token('Lekser',272,290),
  token('Mandag',72,330),
  token('Norsk: Les i bok i sekken 10-15.min.',155,330),
  token('Tur UTEN',72,353),
  token('bål.',72,369),
  token('Matte: Tell til hundre – hva skjer med tallet når det består av to siffer?',155,352),
  token('(Det det består av en mengde tiere og en mengde enere).',155,370),
  token('Bruk gjerne penger eller andre konkreter hjemme – fyrstikker, legobrikker,',155,390),
  token('duplobrikker, steiner, kongler, pinner etc.',155,409),
  token('Tirsdag',72,464),
  token('Norsk: Les i bok i sekken 10-15.min.',155,464),
  token('Onsdag',72,519),
  token('Norsk: Les i bok i sekken 10-15.min.',155,519),
  token('Torsdag',72,575),
  token('Bibliotek',72,597),
  token('Norsk: Les i bok i sekken 10-15.min.',155,575),
  token('Fredag',72,629),
  token('Info:',72,700),
  token('Planleggingsdag fredag 6. november.',72,723),
  token('LESELEKSE:',72,751),
  token('Les gjerne hver side 3 ganger, så blir det god flyt.',72,773),
 ]}];
}
const sorted=homework=>homework.map(x=>({subject:x.subject,dueDay:x.dueDay,
 repeatDays:x.repeatDays||[],text:x.text})).sort((a,b)=>a.subject.localeCompare(b.subject,'nb-NO'));
test('Actual Wilds Minne 2nd-grade PDF: Monday maths AND reading; reading also Tuesday–Thursday',()=>{
 const cells=extractHomeworkDaySections(officialLayout());
 assert.equal(cells.length,5);
 assert.deepEqual(cells.map(x=>[x.subject,x.dueDay]),[
  ['Norsk','Mandag'],['Matte','Mandag'],['Norsk','Tirsdag'],
  ['Norsk','Onsdag'],['Norsk','Torsdag']
 ]);
 assert.equal(cells.some(x=>/Tur UTEN|Bibliotek|LESELEKSE|Planleggingsdag/.test(x.text)),false);
 assert.match(cells.find(x=>x.subject==='Matte').text,/duplobrikker/);
 const result=reconcileHomeworkWithPdf([
  {subject:'Norsk',text:'Les i bok i sekken 10-15.min.',dueDay:null,repeatDays:[]},
  {subject:'Matte',text:'Tell til hundre – hva skjer med tallet når det består av to siffer? (Det det består av en mengde tiere og en mengde enere).',dueDay:null,repeatDays:[]}
 ],officialLayout());
 assert.equal(result.verified,true);
 assert.equal(result.homework.length,2);
 const norwegian=result.homework.find(x=>x.subject==='Norsk');
 const math=result.homework.find(x=>x.subject==='Matte');
 assert.deepEqual(norwegian.repeatDays,['Mandag','Tirsdag','Onsdag','Torsdag']);
 assert.equal(math.dueDay,'Mandag');
 assert.equal(expandHomework(result.homework).length,5);
});
test('Same layout in another school/year must work without a Wilds Minne hardcode',()=>{
 const data=analyzePdfPages(officialLayout(),'3',
  'https://www.minskole.no/DynamicContent//Documents/other.pdf',13,2027,
  'https://www.minskole.no/other/seksjon/3333');
 assert.equal(data.homework.length,2);
 assert.deepEqual(data.homework.find(x=>x.subject==='Norsk')?.repeatDays,
  ['Mandag','Tirsdag','Onsdag','Torsdag']);
 assert.equal(data.homework.find(x=>x.subject==='Matte')?.dueDay,'Mandag');
});
test('Already saved AI homework version 2 reparses PDF on next fetch without a new AI job',()=>{
 const previous={schoolId:'wildsminne',grade:'2',year:2026,week:45,
  homeworkSourceVersion:2,sourceAudit:{status:'ok'},digestPracticalEvidenceVersion:1,
  homework:[{subject:'Norsk',text:'Les i bok i sekken 10-15.min.',dueDay:null,repeatDays:[]},
   {subject:'Matte',text:'Tell til hundre – hva skjer med tallet når det består av to siffer?',dueDay:null,repeatDays:[]}]
 };
 assert.equal(HOMEWORK_SOURCE_VERSION,3);
 assert.equal(needsCachedEvidenceRefresh(previous),true);
 const refreshed=refreshCachedEvidence(previous,officialLayout());
 assert.equal(refreshed.changed,true);
 assert.equal(refreshed.plan.homeworkSourceVersion,3);
 assert.deepEqual(refreshed.plan.homework.find(x=>x.subject==='Norsk')?.repeatDays,
  ['Mandag','Tirsdag','Onsdag','Torsdag']);
 assert.equal(previous.homework[0].dueDay,null);
 assert.equal(previous.homework[0].repeatDays.length,0);
});
test('Original PDF punctuation 10-15.min. is recognised by scoped backup',()=>{
 const p={schoolId:'wildsminne',grade:'2',year:2026,week:45,status:'ok',
  homework:[
   {subject:'Norsk',text:'Les i bok i sekken 10-15.min.',dueDay:null,repeatDays:[]},
   {subject:'Matte',text:'Tell til hundre – hva skjer med tallet når det består av to siffer?',dueDay:null,repeatDays:[]}
  ]};
 const out=correctWildsMinneWeek45Homework(p);
 assert.deepEqual(out.homework[0].repeatDays,['Mandag','Tirsdag','Onsdag','Torsdag']);
 assert.equal(out.homework[1].dueDay,'Mandag');
});
test('Never assign weekdays based on a normal timetable on PDF page 2',()=>{
 const timetable=[{width:600,height:800,items:[
  token('Mandag',80,300),token('Tirsdag',160,300),
  token('Onsdag',240,300),token('Torsdag',320,300),
  token('Fredag',400,300),token('Norsk',80,340),token('Matte',160,340)
 ]}];
 assert.deepEqual(extractHomeworkEvidenceCells(timetable),[]);
});
