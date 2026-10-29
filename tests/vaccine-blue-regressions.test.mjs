import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {notesWithImportantEvents,isVaccineNotice} from '../public/shared/day-view.mjs';
import {groupNamesInText} from '../public/shared/group-scope.mjs';
import {recoverDocumentedAttendance} from '../lib/attendance.mjs';
import {normalizeAIPlan,AI_SCHEMA_VERSION,SYSTEM_PROMPT} from '../lib/ai-plan.mjs';

const quote='Mandag: Rosa og blå gruppe møter kl. 08.05. Alle skal ha svømming.';
const src=text=>({sourcePage:1,sourceQuote:text});
const meta=pageTexts=>({grade:'3',week:44,year:2026,source:'https://www.minskole.no/fagerholt/seksjon/22636',
 pdf:'https://www.minskole.no/DynamicContent/Documents/uke44.pdf',pageCount:1,pageTexts});
const empty={days:[],attendance:[],dayNotes:[],homework:[],packing:[],notices:[],subjects:[],
 learningGoals:[],specialContent:[],weekTheme:{text:null,sourcePage:null,sourceQuote:''},
 optionalMission:{text:null,sourcePage:null,sourceQuote:''},coverage:{state:'complete',reason:''}};

test('Vaksine omtalt i både dagsplan og praktisk beskjed vises kun én gang',()=>{
 const events=[{title:'Vaksinasjon tirsdag',time:'10:00',group:null}];
 const notes=[{text:'Vaksine tirsdag kl. 10.00.'},{text:'Elevene skal få vaksine tirsdag. Husk samtykke.'}];
 const shown=notesWithImportantEvents(events,notes);
 assert.equal(shown.length,1);
 assert.equal(shown[0].important,true);
 assert.match(shown[0].text,/samtykke/i);
 assert.match(shown[0].text,/10[:.]00/);
 assert.equal(isVaccineNotice(shown[0].text),true);
});
test('Separate vaccine details are combined inside one callout; ordinary notes remain',()=>{
 const shown=notesWithImportantEvents([{title:'Vaksine mot sykdom X',time:'09:30'}],[
  {text:'Vaksine mot sykdom X, møt kl. 09.30'},{text:'Husk underskrevet skjema til vaksineringen'},
  {text:'Ta med innesko'}
 ]);
 assert.equal(shown.length,2);
 assert.equal(shown[0].important,true);
 assert.match(shown[0].text,/skjema/);
 assert.match(shown[0].text,/09[:.]30/);
 assert.equal(shown[1].text,'Ta med innesko');
});

test('Vaksinasjon under Fag denne uka filtreres fra AI-normalisering',()=>{
 const text='Norsk. Matematikk. Vaksinasjon på tirsdag.';
 const raw={...empty,days:[{day:'Tirsdag',events:[{title:'Vaksinering',time:'10:00',...src(text)}]}],
  subjects:[{text:'Norsk',...src(text)},{text:'Vaksinasjon på tirsdag',...src(text)},
   {text:'Matematikk; Vaksine kl 10',...src(text)}]};
 const plan=normalizeAIPlan(raw,meta([text]));
 assert.deepEqual(plan.subjects,['Norsk','Matematikk']);
 assert.equal(AI_SCHEMA_VERSION,18);
 assert.match(SYSTEM_PROMPT,/ikke skolefag/);
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/allEvents\.filter\(x=>!isVaccineNotice\(x\.title\)\)/);
 assert.match(app,/filter\(x=>x&&!isVaccineNotice\(x\)\)/);
});
test('Mandag: Blå gruppe gjenfinnes fra tydelig PDF-kilde selv om AI utelater oppmøtet',()=>{
 const page='Mandag: Rosa og blå gruppe møter kl. 08.05. Alle har svømming.';
 const raw={...empty,days:[{day:'Mandag',events:[{title:'Alle har svømming',time:null,...src(page)}]}]};
 const plan=normalizeAIPlan(raw,meta([page]));
 assert.deepEqual(plan.attendance.map(x=>[x.day,x.group,x.time]),[
  ['Mandag','Rosa gruppe','08:05'],['Mandag','Blå gruppe','08:05']
 ]);
});
test('Blå gruppe på tirsdag flyttes aldri til mandag',()=>{
 const page='Mandag: Rosa gruppe møter kl. 08.05. Tirsdag: Blå gruppe møter kl. 08.15.';
 const plan=normalizeAIPlan({...empty,days:[{day:'Mandag',events:[{title:'Svømming',time:null,...src(page)}]}]},meta([page]));
 assert.ok(!plan.attendance.some(x=>x.day==='Mandag'&&x.group==='Blå gruppe'));
 assert.ok(plan.attendance.some(x=>x.day==='Tirsdag'&&x.group==='Blå gruppe'&&x.time==='08:15'));
});
test('Ulikt klokkeslett kan ikke lånes av neste gruppe',()=>{
 const page='Mandag: Rosa gruppe møter kl. 08.05. Blå gruppe møter kl. 09.00.';
 const recovered=recoverDocumentedAttendance([page]);
 assert.ok(recovered.some(x=>x.group==='Rosa gruppe'&&x.time==='08:05'));
 assert.ok(!recovered.some(x=>x.group==='Blå gruppe'&&x.time==='08:05'));
});
test('Skannede setninger med hyfenert fargegruppe blir forstått uten hardkoding',()=>{
 assert.deepEqual(groupNamesInText('Blå- og rosa-gruppa møter kl. 08.05'),
  ['Blå gruppe','Rosa gruppe']);
 assert.deepEqual(groupNamesInText('Vi maler veggen rosa og blå'),[]);
});
