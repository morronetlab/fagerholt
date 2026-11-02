import test from 'node:test';
import assert from 'node:assert/strict';
import {extractHomeworkDaySections} from '../lib/homework-day-sections.mjs';
import {extractHomeworkEvidenceCells,reconcileHomeworkWithPdf,HOMEWORK_SOURCE_VERSION} from '../lib/homework-source-truth.mjs';
import {normalizeAIPlan} from '../lib/ai-plan.mjs';
import {analyzePdfPages} from '../lib/plan-core.mjs';
import {expandHomework} from '../public/shared/homework-view.mjs';
import {needsCachedEvidenceRefresh,refreshCachedEvidence} from '../lib/plan-cache-evidence.mjs';

const tok=(text,x,y)=>({text,x,y,width:Math.min(670,text.length*4.8)});
const page=()=>({width:900,height:860,items:[
 tok('LEKSER',75,110),
 tok('Mandag',78,151),
 tok('Matte: Tell til hundre med to siffer.',102,177),
 tok('Tirsdag',78,221),
 tok('Norsk: Les i bok i sekken 10–15 min.',102,251),
 tok('Onsdag',78,315),
 tok('Norsk: Les i bok i sekken 10–15 min.',102,343),
 tok('Torsdag',78,416),
 tok('Norsk: Les i bok i sekken 10–15 min.',102,444),
 tok('Fredag',78,517),
 tok('Ingen lekser',102,545),
 tok('Læringsmål',75,600),
 tok('Vi skal øve på addisjon.',102,627)
]});
const pages=()=>[page()];
const meta=()=>({schoolId:'other-school',grade:'3',year:2027,week:12,
 source:'https://minskole.no/another/seksjon/22111',
 pdf:'https://minskole.no/DynamicContent//Documents/example.pdf',
 pageCount:1,pageLayouts:pages(),pageTexts:[page().items.map(t=>t.text).join(' ')]});
const raw=()=>({
 days:[],attendance:[],dayNotes:[],packing:[],notices:[],learningGoals:[],subjects:[],
 vocabulary:[],contacts:[],specialContent:[],
 weekTheme:{text:null,sourcePage:null,sourceQuote:''},
 optionalMission:{text:null,sourcePage:null,sourceQuote:''},
 homework:[
  {subject:'Norsk',text:'Les i bok i sekken 10–15 min.',dueDay:null,repeatDays:[],
   group:null,sourcePage:1,sourceQuote:'Norsk: Les i bok i sekken 10–15 min.'},
  {subject:'Matte',text:'Tell til hundre med to siffer.',dueDay:null,repeatDays:[],
   group:null,sourcePage:1,sourceQuote:'Matte: Tell til hundre med to siffer.'}
 ],coverage:{state:'complete',reason:'Documented homework block'}
});
test('General vertical homework section supplies all four dated cells and excludes Friday without homework',()=>{
 const cells=extractHomeworkDaySections(pages());
 assert.deepEqual(cells.map(cell=>[cell.subject,cell.dueDay]),[
  ['Matte','Mandag'],['Norsk','Tirsdag'],['Norsk','Onsdag'],['Norsk','Torsdag']]);
 assert.ok(cells.every(c=>c.evidence==='homework-day-section'&&c.sourcePage===1));
 const result=reconcileHomeworkWithPdf(raw().homework,pages());
 assert.equal(result.verified,true);
 assert.equal(result.homework.length,2);
 assert.deepEqual(result.homework.find(t=>t.subject==='Norsk')?.repeatDays,
  ['Tirsdag','Onsdag','Torsdag']);
 assert.equal(result.homework.find(t=>t.subject==='Matte')?.dueDay,'Mandag');
 assert.deepEqual(expandHomework(result.homework).map(t=>t.repeatDay||t.dueDay),
  ['Mandag','Tirsdag','Onsdag','Torsdag']);
});
test('Unrelated school, year and class: AI and rule parser use the same verified day sections',()=>{
 const data=meta(),text=raw();
 const ai=normalizeAIPlan(text,data);
 const rules=analyzePdfPages(pages(),'3',data.pdf,12,2027,data.source);
 for(const result of [ai,rules]){
  assert.equal(result.homework.length,2);
  assert.equal(result.homework.find(x=>x.subject==='Matte')?.dueDay,'Mandag');
  assert.deepEqual(result.homework.find(x=>x.subject==='Norsk')?.repeatDays,['Tirsdag','Onsdag','Torsdag']);
 }
});
test('Cached AI schema is corrected on a PDF-only read, without rerunning AI',()=>{
 const cache={...meta(),...normalizeAIPlan(raw(),meta()),homework:raw().homework,
  schoolId:'other-school',sourceAudit:{status:'ok'},homeworkSourceVersion:1,
  digestPracticalEvidenceVersion:1};
 assert.equal(HOMEWORK_SOURCE_VERSION,2);
 assert.equal(needsCachedEvidenceRefresh(cache),true);
 const refreshed=refreshCachedEvidence(cache,pages());
 assert.equal(refreshed.changed,true);
 assert.equal(refreshed.plan.homeworkSourceVersion,2);
 assert.deepEqual(refreshed.plan.homework.find(t=>t.subject==='Norsk').repeatDays,
  ['Tirsdag','Onsdag','Torsdag']);
 assert.deepEqual(cache.homework[0].repeatDays,[]);
});
test('Never read a normal weekday timetable as homework',()=>{
 const p=page();
 p.items=p.items.filter(x=>x.text!=='LEKSER');
 p.items.unshift(tok('UKEPLAN – DETTE SKJER PÅ SKOLEN',74,105));
 assert.deepEqual(extractHomeworkDaySections([p]),[]);
 assert.deepEqual(extractHomeworkEvidenceCells([p]),[]);
});
test('No invented deadline from an isolated weekday or unlabelled week tasks',()=>{
 const p=page();
 p.items=p.items.filter(x=>!['Tirsdag','Onsdag','Torsdag','Fredag'].includes(x.text));
 assert.deepEqual(extractHomeworkDaySections([p]),[]);
 const p2=page();
 p2.items=p2.items.filter(x=>x.text!=='LEKSER');
 assert.equal(reconcileHomeworkWithPdf(raw().homework,[p2]).verified,false);
});
test('Generic week-numbered homework heading is supported across school years',()=>{
 const p=page();
 p.items=p.items.map(item=>item.text==='LEKSER'?{...item,text:'LEKSER UKE 12'}:item);
 assert.equal(extractHomeworkDaySections([p]).length,4);
});
test('Day section stops before goal/information blocks',()=>{
 const p=page();
 p.items.push(tok('Mandag',80,671),tok('Matte: Gjør side 32',103,695));
 const rows=extractHomeworkDaySections([p]);
 assert.equal(rows.some(x=>/side 32/.test(x.text)),false);
});
test('Existing explicit Til weekday tables retain their own source evidence',()=>{
 const p={width:850,height:700,items:[
  tok('Ukas utfordringer',20,80),
  tok('Til tirsdag',240,112),tok('Til fredag',480,112),
  tok('Matte: Gjør side 12',240,155),
  tok('Norsk: Les teksten',480,155),
  tok('Læringsmål',20,350)
 ]};
 const cells=extractHomeworkEvidenceCells([p]);
 assert.equal(cells.length,2);
 assert.deepEqual(cells.map(x=>x.dueDay),['Tirsdag','Fredag']);
});

test('Source geometry never broadens a group-scoped homework item to all pupils',()=>{
 const original={subject:'Norsk',text:'Les i bok i sekken 10–15 min.',
  dueDay:null,repeatDays:[],group:'Rød gruppe'};
 const reconciled=reconcileHomeworkWithPdf([original],pages());
 const matched=reconciled.homework.filter(x=>/Les i bok/.test(x.text));
 assert.equal(matched.length,1);
 assert.equal(matched[0].group,'Rød gruppe');
 assert.equal(matched[0].dueDay,null);
 assert.deepEqual(matched[0].repeatDays,[]);
});
