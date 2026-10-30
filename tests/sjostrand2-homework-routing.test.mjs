import test from 'node:test';
import assert from 'node:assert/strict';
import {splitPracticalHomework,classifyHomeworkText,packingLabels} from '../lib/homework-routing.mjs';
import {normalizeAIPlan} from '../lib/ai-plan.mjs';
import {analyzePdfPages} from '../lib/plan-core.mjs';

const vaccine='Vaksine onsdag morgen.';
const shoes='Ta med gymsko.';
const realReading='Norsk: Les s. 58-59 i Fabel lesebok. Teksten leses 3 ganger.';
const worksheet='Ukelekse: Gjør eget ark i leksemappa.';
const school='https://www.minskole.no/sjostrand/seksjon/22169';
const pdf='https://www.minskole.no/DynamicContent//Documents/866-Sjostrand-Ukebrev-uke-44-ca300aa3-539e.pdf';
const sourceText='Lekser til tirsdag Lekser til onsdag Lekser til torsdag Lekser til fredag. '+realReading+
 ' '+worksheet+' Lekser til onsdag: '+vaccine+' Lekser til fredag: '+shoes;
const src=sourceQuote=>({sourcePage:1,sourceQuote});
const empty={
 days:[],attendance:[],dayNotes:[],homework:[],packing:[],notices:[],learningGoals:[],subjects:[],
 vocabulary:[],contacts:[],specialContent:[],
 weekTheme:{text:null,sourcePage:null,sourceQuote:''},optionalMission:{text:null,sourcePage:null,sourceQuote:''},
 coverage:{state:'complete',reason:''}
};
const metadata={grade:'2',year:2026,week:44,source:school,pdf,pageCount:1,pageTexts:[sourceText]};
test('Sjøstrand uke 44: vaccine and shoes are not pupil homework',()=>{
 const raw={...empty,homework:[
  {subject:'Norsk',text:realReading,dueDay:null,repeatDays:[],group:null,...src(realReading)},
  {subject:'Ukelekse',text:worksheet,dueDay:null,repeatDays:[],group:null,...src(worksheet)},
  {subject:null,text:vaccine,dueDay:'Onsdag',repeatDays:[],group:null,...src('Lekser til onsdag: '+vaccine)},
  {subject:null,text:shoes,dueDay:'Fredag',repeatDays:[],group:null,...src('Lekser til fredag: '+shoes)}
 ]};
 const plan=normalizeAIPlan(raw,metadata);
 assert.ok(plan.homework.some(item=>/Fabel lesebok/.test(item.text)));
 assert.ok(plan.homework.some(item=>/eget ark/.test(item.text)));
 assert.ok(!plan.homework.some(item=>/vaksin|gymsko/i.test(item.text)));
 assert.ok(plan.dayNotes.Onsdag.some(note=>/Vaksine onsdag morgen/.test(note.text)));
 assert.ok(plan.days.Fredag.bring.some(item=>item.label==='Gymsko'));
 assert.ok(plan.provenance.some(p=>p.kind==='packing'));
});
test('A combined item from a PDF cell is split into separate practical notices',()=>{
 const pieces=splitPracticalHomework('Vaksine onsdag morgen. Ta med gymsko.');
 assert.equal(pieces.length,2);
 assert.equal(classifyHomeworkText(pieces[0]).kind,'vaccine');
 assert.equal(classifyHomeworkText(pieces[1]).kind,'packing');
 assert.deepEqual(packingLabels(pieces[1]),['Gymsko']);
 assert.equal(classifyHomeworkText('Til fredag: Ta med gymsko.').kind,'packing');
 assert.equal(classifyHomeworkText('Til onsdag: Vaksine onsdag morgen.').day,'Onsdag');
 assert.equal(classifyHomeworkText('Lag en plakat om hvordan vaksiner virker').kind,'homework');
 assert.equal(classifyHomeworkText('Husk å lese side 33').kind,'homework');
});
test('Fallback parser reclassifies content below an explicit homework heading',()=>{
 const token=(text,y)=>({text,x:26,y,width:Math.min(450,text.length*5)});
 const page={width:900,height:700,items:[
  token('Lekser',165),token('Til tirsdag: '+realReading,196),
  token('Til tirsdag: '+worksheet,223),
  token('Til onsdag: '+vaccine,256),
  token('Til fredag: '+shoes,284)
 ]};
 const plan=analyzePdfPages([page],'2',pdf,44,2026,school);
 assert.ok(!plan.homework.some(item=>/vaksin|gymsko/i.test(item.text)));
 assert.ok(plan.homework.some(item=>/Fabel lesebok/i.test(item.text)));
 assert.ok(plan.dayNotes.Onsdag.some(item=>/vaksine/i.test(item.text)));
 assert.ok(plan.days.Fredag.bring.some(item=>item.label==='Gymsko'));
});

test('Rules fallback does not invent actionable reminders for undated packing fragments',()=>{
 const token=(text,y)=>({text,x:25,y,width:text.length*5});
 const page={width:850,height:700,items:[
  token('Lekser',130),token('Ta med: Refleks',175),
  token('Ta med: Engelskboka',218)
 ]};
 const plan=analyzePdfPages([page],'2',pdf,45,2026,school);
 assert.ok(!(plan.notices||[]).some(item=>/sjekk hvilken dag i PDF-en/i.test(String(item))));
 assert.ok(!Object.values(plan.days).flatMap(day=>day.bring).some(item=>
  /Refleks|Engelskboka/i.test(item.label)));
});
