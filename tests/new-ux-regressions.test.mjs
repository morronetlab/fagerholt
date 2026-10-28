import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {displayDayEvent,uniqueDayEvents,noDayScheduleMessage} from '../public/shared/day-view.mjs';
import {sourceRepeatDays,recoverReadingHomework} from '../lib/homework-days.mjs';
import {estimateAiSeconds,estimatedPercent} from '../public/shared/ai-estimate.mjs';
import {normalizeAIPlan,AI_SCHEMA_VERSION} from '../lib/ai-plan.mjs';
import {planFeedback} from '../public/shared/plan-feedback.mjs';
const source={sourcePage:1,sourceQuote:'Praktisk informasjon for uka'};
const basic={days:[],attendance:[],dayNotes:[],homework:[],packing:[],notices:[],learningGoals:[],subjects:[],specialContent:[],weekTheme:{text:null,sourcePage:null,sourceQuote:''},optionalMission:{text:null,sourcePage:null,sourceQuote:''},coverage:{state:'complete',reason:''}};
const meta={grade:'1',year:2026,week:44,source:'https://www.minskole.no/voiebyen/seksjon/22697',pdf:'https://www.minskole.no/DynamicContent/Documents/week44.pdf',pageTexts:[source.sourceQuote],pageCount:1};
test('Fagerholt grade 7: show 13:00 once in a lesson, retain different simultaneous lessons',()=>{
 const e=displayDayEvent({title:'Matematikk 13:00 kl 13:00',time:'13:00'});
 assert.equal([e.title,e.time].join(' ').match(/13:00/g)?.length,1);
 assert.equal(displayDayEvent({title:'13:00 13:00 13:00',time:null}).time,'13:00');
 assert.equal(uniqueDayEvents([{title:'Matte kl. 13.00',time:'13:00'},{title:'Matte',time:'13:00'},{title:'Engelsk',time:'13:00'}]).length,2);
});
test('Voiebyen 1: practical day notes are preserved independently of schedule',()=>{
 const quote='Praktisk informasjon for dagen';
 const notes='Vi skal være ute i store deler av dagen. '.repeat(8);
 const p=normalizeAIPlan({...basic,dayNotes:[{day:'Mandag',text:notes,group:null,sourcePage:1,sourceQuote:quote}]},{...meta,pageTexts:[quote]});
 assert.ok(p.dayNotes.Mandag[0].text.length>200);
 assert.match(noDayScheduleMessage({hasNotes:true}),/praktisk informasjon/);
});
test('Wilds Minne 2: recurring reading is recovered when source explicitly names its days',()=>{
 const quote='Leselekse: Les i boka mandag til torsdag.';
 const p=normalizeAIPlan({...basic},{...meta,grade:'2',pageTexts:[quote]});
 assert.deepEqual(p.homework[0].repeatDays,['Mandag','Tirsdag','Onsdag','Torsdag']);
 assert.equal(p.homework[0].subject,'Lesing');
 assert.deepEqual(sourceRepeatDays('Les hver dag unntatt fredag','Les hver dag unntatt fredag'),['Mandag','Tirsdag','Onsdag','Torsdag']);
 assert.equal(recoverReadingHomework(['Tur mandag. Matte tirsdag. Les dikt onsdag.'],[]).length,0);
});
test('Two loading states distinguish PDF retrieval from AI processing',()=>{
 const school={name:'Voiebyen skole',homepage:'https://www.minskole.no/voiebyen'};
 assert.equal(planFeedback({school,grade:'1',loading:true}).kind,'fetching');
 const ai=planFeedback({school,grade:'1',plan:{aiStatus:'processing',status:'partial',pdf:'https://www.minskole.no/week44.pdf'}});
 assert.equal(ai.kind,'analyzing');assert.equal(ai.hideContent,true);
});
test('Estimated time changes with PDF size, progress never reports complete early',()=>{
 assert.ok(estimateAiSeconds({pages:8,bytes:7000000})>estimateAiSeconds({pages:1,bytes:90000}));
 assert.equal(estimatedPercent(1000,40),95);
 assert.ok(AI_SCHEMA_VERSION>=10);
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="notices-empty-hint"/);assert.match(html,/id="goals-empty-hint"/);
 assert.match(html,/id="day-notes"/);
});
