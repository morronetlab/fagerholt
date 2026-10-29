import test from 'node:test';
import assert from 'node:assert/strict';
import {extractHomeworkDeadlineCells,extractUndatedWeeklyHomework,dueDayFromHomeworkCells} from '../lib/homework-grid.mjs';
import {normalizeAIPlan} from '../lib/ai-plan.mjs';
import {analyzePdfPages} from '../lib/plan-core.mjs';

// The original official PDF is "UKEPLAN 6.TRINN - UKE 44", page 1:
// https://www.minskole.no/DynamicContent//Documents/863-todda-Uke-44-.-c350c815-359d.pdf
// Its four columns actually say: Til torsdag | Til onsdag | Til torsdag | Til fredag.
// These de-identified coordinates reproduce the real visual layout (not a binary PDF).
const tok=(text,x,y)=>({text,x,y,width:text.length*5});
const page=()=>({width:1000,height:1450,items:[
 tok('LEKSER UKE 44',110,780),
 tok('Til torsdag',115,810),tok('Til onsdag',315,810),tok('Til torsdag',515,810),tok('Til fredag',715,810),
 tok('Naturfag',120,850),tok('Les teksten du har fått',120,885),
 tok('utdelt og svar på',120,905),tok('spørsmålene.',120,925),tok('Skriv svarene i lekseboka.',120,960),
 tok('Engelsk:',120,1010),tok('Les arket du har fått utdelt.',120,1040),
 tok('Skriv svaret på spørsmålene i lekseboka.',120,1062),
 tok('Leksefri pga. halloween-arrangementet på Tangen vgs.',320,850),
 tok('Matte',520,850),tok('Jobb med arket du har fått utdelt.',520,880),
 tok('Skriv svarene i innføringsboka.',520,907),
 tok('Norsk: Les minimum 20',720,850),tok('minutter i selvvalgt bok.',720,877),
 tok('Skriv et kort sammendrag av',720,910),tok('det du har lest (i lekseboka).',720,935),
 tok('Ukelekse',115,1113),tok('Sosialt: Vi øver på å lytte til hverandre og ikke avbryte når andre snakker.',120,1150)
]});
const meta=()=>({grade:'6',week:44,year:2026,source:'https://www.minskole.no/todda/seksjon/22410',
 pdf:'https://www.minskole.no/DynamicContent//Documents/863-todda-Uke-44-.-c350c815-359d.pdf',
 pageCount:1,pageLayouts:[page()],pageTexts:[page().items.map(x=>x.text).join(' ')]});
const empty=()=>({days:[],attendance:[],dayNotes:[],homework:[],packing:[],notices:[],
 learningGoals:[],subjects:[],contacts:[],specialContent:[],vocabulary:[],
 weekTheme:{text:null,sourcePage:null,sourceQuote:''},optionalMission:{text:null,sourcePage:null,sourceQuote:''},
 coverage:{state:'complete',reason:'PDF contains a clear homework table'}});
const assignment=(subject,text,dueDay,quote)=>({subject,text,dueDay,repeatDays:[],group:null,sourcePage:1,sourceQuote:quote||text});

test('Todda: duplicate Til torsdag columns remain separate, Wednesday is homework-free',()=>{
 const cells=extractHomeworkDeadlineCells([page()]);
 assert.equal(cells.length,4);
 assert.deepEqual(cells.map(c=>[c.subject,c.dueDay]),[
  ['Naturfag','Torsdag'],['Engelsk','Torsdag'],['Matte','Torsdag'],['Norsk','Fredag']]);
 assert.deepEqual(cells.map(c=>c.cell),[0,0,2,3]);
 assert.doesNotMatch(cells.map(c=>c.text).join(' '),/leksefri|halloween|ukelekse/i);
 const weekly=extractUndatedWeeklyHomework([page()]);
 assert.deepEqual(weekly.map(x=>[x.subject,x.dueDay]),[['Sosialt',null]]);
});
test('Fallback uses physical cell deadlines and never dates a weekly homework task',()=>{
 const plan=analyzePdfPages([page()],'6',meta().pdf,44,2026,meta().source);
 for(const [subject,day] of [['Naturfag','Torsdag'],['Engelsk','Torsdag'],['Matte','Torsdag'],['Norsk','Fredag'],['Sosialt',null]]){
  const task=plan.homework.find(t=>t.subject===subject);
  assert.ok(task,'Missing '+subject+' homework');
  assert.equal(task.dueDay,day,'Incorrect due date for '+subject);
 }
 assert.equal(plan.homework.filter(t=>t.subject==='Naturfag').length,1);
 assert.doesNotMatch(plan.homework.map(t=>t.text).join(' '),/leksefri|halloween/i);
});
test('AI loses or invents due dates: column evidence recovers and corrects them',()=>{
 const raw=empty();
 raw.homework=[
  assignment('Naturfag','Les teksten du har fått utdelt og svar på spørsmålene',null),
  assignment('Engelsk','Les arket du har fått utdelt. Skriv svaret på spørsmålene i lekseboka.','Tirsdag'),
  assignment('Matte','Jobb med arket du har fått utdelt. Skriv svarene i innføringsboka.',null),
  assignment('Norsk','Les minimum 20 minutter i selvvalgt bok. Skriv et kort sammendrag av det du har lest','Torsdag')
 ];
 const plan=normalizeAIPlan(raw,meta());
 for(const [subject,expected] of [['Naturfag','Torsdag'],['Engelsk','Torsdag'],['Matte','Torsdag'],['Norsk','Fredag']]){
  const homework=plan.homework.filter(t=>t.subject===subject);
  assert.equal(homework.length,1,'No duplicates for '+subject);
  assert.equal(homework[0].dueDay,expected);
 }
 assert.ok(plan.homework.some(t=>t.subject==='Sosialt'&&t.dueDay===null));
});
test('Missing AI tasks are restored from source cells instead of silently disappearing',()=>{
 const plan=normalizeAIPlan({...empty(),homework:[
  assignment('Norsk','Les minimum 20 minutter i selvvalgt bok. Skriv et kort sammendrag av det du har lest',null)
 ]},meta());
 assert.deepEqual(['Naturfag','Engelsk','Matte','Norsk'].map(subject=>
  plan.homework.find(x=>x.subject===subject)?.dueDay),['Torsdag','Torsdag','Torsdag','Fredag']);
});
test('A weekday elsewhere on the PDF never assigns a due date to an unrelated task',()=>{
 const cells=extractHomeworkDeadlineCells([page()]);
 assert.equal(dueDayFromHomeworkCells({subject:'Norsk',text:'Husk gymtøy til mandag og onsdag',sourcePage:1},cells),null);
 assert.equal(dueDayFromHomeworkCells({subject:'Matte',text:'Gjør oppgaver i ei tilfeldig bok',sourcePage:1},cells),null);
});
test('Splitting the Til + torsdag PDF tokens does not lose source geometry',()=>{
 const p=page();
 p.items=p.items.filter(x=>!(x.text==='Til torsdag'&&x.x===515));
 p.items.push(tok('Til',515,810),tok('torsdag',533,810));
 const cells=extractHomeworkDeadlineCells([p]);
 assert.equal(cells.length,4);
 assert.equal(cells.find(x=>x.subject==='Matte')?.dueDay,'Torsdag');
});
test('Ambiguous matches against two different due columns are never guessed',()=>{
 const cells=[{dueDay:'Tirsdag',text:'Les teksten og gjør oppgavene',subject:null,sourcePage:1},
  {dueDay:'Fredag',text:'Les teksten og gjør oppgavene',subject:null,sourcePage:1}];
 assert.equal(dueDayFromHomeworkCells({text:'Les teksten og gjør oppgavene',sourcePage:1},cells),null);
});

test('Weekly homework with null dueDay is not mistaken for an already-matched dated cell',()=>{
 const source=extractUndatedWeeklyHomework([page()]);
 assert.equal(source.length,1);
 const plan=normalizeAIPlan(empty(),meta());
 assert.equal(plan.homework.filter(t=>t.subject==='Sosialt'&&t.dueDay===null).length,1);
});
