import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AI_SCHEMA,AI_SCHEMA_VERSION,normalizeAIPlan,SYSTEM_PROMPT} from '../lib/ai-plan.mjs';
import {verifiedAttendance,sharedActivity} from '../lib/attendance.mjs';
const quote='Alle elever skal ha svømming på mandag og tirsdag. Rød gruppe møter kl. 08.05 mandag; Grønn gruppe møter kl. 08.05 tirsdag.';
const meta={grade:'3',week:44,year:2026,source:'https://www.minskole.no/valgfri/seksjon/123',pdf:'https://www.minskole.no/DynamicContent/Documents/uke44.pdf',pageCount:1,pageTexts:[quote]};
const src={sourcePage:1,sourceQuote:quote};
const ev=(title,group=null)=>({title,group,time:null,...src});
const att=(day,group)=>({day,group,time:'08.05',text:'Møt ved svømmehallen',...src});
const raw={days:[{day:'Mandag',events:[ev('Svømming','Rød gruppe')]},{day:'Tirsdag',events:[ev('Svømming',null)]}],
 attendance:[att('Mandag','Rød gruppe'),att('Tirsdag','Grønn gruppe')],
 homework:[],packing:[],notices:[],learningGoals:[],subjects:[],specialContent:[],
 weekTheme:{text:null,sourcePage:null,sourceQuote:''},optionalMission:{text:null,sourcePage:null,sourceQuote:''},
 coverage:{state:'complete',reason:''}};
test('Common swimming remains for all; specific arrival at 08.05 only applies to verified groups',()=>{
 const result=normalizeAIPlan(raw,meta);
 assert.equal(AI_SCHEMA_VERSION,13);
 assert.ok(AI_SCHEMA.required.includes('attendance'));
 assert.ok(SYSTEM_PROMPT.includes('særskilte oppmøtetider'));
 assert.deepEqual(result.days.Mandag.events.map(e=>e.group),[undefined]);
 assert.deepEqual(result.days.Tirsdag.events.map(e=>e.group),[undefined]);
 assert.deepEqual(result.attendance.map(x=>[x.day,x.group,x.time]),[['Mandag','Rød gruppe','08:05'],['Tirsdag','Grønn gruppe','08:05']]);
});
test('Generic swim instruction with no separate arrival remains unscoped',()=>{
 const x=structuredClone(raw);x.attendance=[];x.days[0].events[0].group=null;
 const p=normalizeAIPlan(x,meta);
 assert.equal(p.days.Mandag.events[0].group,undefined);
 assert.deepEqual(p.attendance.map(x=>[x.day,x.group,x.time]),[
  ['Mandag','Rød gruppe','08:05'],['Tirsdag','Grønn gruppe','08:05']
 ]); // Explicit PDF appointments are recovered even if AI omits attendance.
});
test('A group name and time somewhere on a page is not enough to fabricate a meeting',()=>{
 const bad=[
  {...att('Mandag','Rød gruppe'),sourceQuote:'Alle har svømming mandag'},
  {...att('Mandag','Rød gruppe'),time:'08.15'},
  {...att('Mandag','Grønn gruppe'),sourceQuote:'Grønn gruppe møter kl 08.05 på torsdag'},
  {...att('Mandag','Blå gruppe')},
  {...att('Mandag','Rød gruppe'),sourcePage:8}
 ];
 const x=structuredClone(raw);x.attendance=bad;
 const p=normalizeAIPlan(x,meta);
 assert.deepEqual(p.attendance.map(x=>[x.day,x.group,x.time]),[
  ['Mandag','Rød gruppe','08:05'],['Tirsdag','Grønn gruppe','08:05']
 ]); // Explicit PDF appointments are recovered even if AI omits attendance.
});
test('Group, time and weekday must be associated, not taken from unrelated lesson',()=>{
 const quoted='Rød gruppe møtes på mandag. Elevene møter kl 08.05 fredag.';
 assert.equal(verifiedAttendance({...att('Mandag','Rød gruppe'),sourceQuote:quoted},quoted),null);
 assert.equal(verifiedAttendance({...att('Mandag','Rød gruppe'),sourceQuote:'Rød gruppe møter kl 08.05 tirsdag'},'Rød gruppe møter kl 08.05 tirsdag'),null);
 assert.equal(sharedActivity('Svømming',quote),true);
});
test('UI puts group-specific arrival separately under the common school-day activity',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/original-look.css',import.meta.url),'utf8');
 assert.match(html,/id="day-attendance"/);
 assert.match(js,/p\?\.attendance/);
 assert.match(js,/Særskilt oppmøte for enkelte grupper/);
 assert.match(css,/\.attendance-entry/);
});
