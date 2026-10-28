import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {groupNamesInText,groupColorClass,groupLabel} from '../public/shared/group-scope.mjs';
import {verifiedAttendanceEntries,verifiedAttendance} from '../lib/attendance.mjs';
import {normalizeAIPlan,AI_SCHEMA_VERSION,SYSTEM_PROMPT} from '../lib/ai-plan.mjs';
import {groupSimultaneousEvents,notesWithImportantEvents,isVaccineNotice} from '../public/shared/day-view.mjs';
import {buildCommit} from '../scripts/write-build-info.mjs';

const src=(sourceQuote)=>({sourcePage:1,sourceQuote});
const base={days:[],attendance:[],dayNotes:[],homework:[],packing:[],notices:[],learningGoals:[],subjects:[],specialContent:[],
 weekTheme:{text:null,sourcePage:null,sourceQuote:''},optionalMission:{text:null,sourcePage:null,sourceQuote:''},coverage:{state:'complete',reason:''}};
const meta=text=>({grade:'3',year:2026,week:44,source:'https://www.minskole.no/fagerholt/seksjon/22636',
 pdf:'https://www.minskole.no/DynamicContent/Documents/uke44.pdf',pageCount:1,pageTexts:[text]});

test('Felles oppmøte for rosa og blå gruppe blir til to kildebelagte oppmøter',()=>{
 const text='Mandag: Rosa og blå gruppe møter kl. 08.05 ved inngangen.';
 assert.deepEqual(groupNamesInText('Rosa og blå gruppe'),['Rosa gruppe','Blå gruppe']);
 const entry={day:'Mandag',group:'Rosa gruppe',time:'08.05',text:'Møt ved inngangen',...src(text)};
 assert.deepEqual(verifiedAttendanceEntries(entry,text).map(x=>x.group),['Rosa gruppe','Blå gruppe']);
 const plan=normalizeAIPlan({...base,attendance:[entry]},meta(text));
 assert.deepEqual(plan.attendance.map(x=>[x.day,x.group,x.time]),[
  ['Mandag','Rosa gruppe','08:05'],['Mandag','Blå gruppe','08:05']]);
 assert.equal(AI_SCHEMA_VERSION,14);
 assert.match(SYSTEM_PROMPT,/FLERE grupper/);
});

test('Forskjellige grupper og tidspunkt mandag/tirsdag blandes ikke sammen',()=>{
 const monday='Mandag: Rosa gruppe og lilla gruppe møter kl. 08.05.';
 const tuesday='Tirsdag: Gul og grønn gruppe møter kl. 08.15.';
 const page=monday+' '+tuesday;
 const x={...base,attendance:[
  {day:'Mandag',group:'Rosa gruppe og lilla gruppe',time:'08.05',text:'Oppmøte ved skolen',...src(monday)},
  {day:'Tirsdag',group:'Gul og grønn gruppe',time:'08.15',text:'Oppmøte ved skolen',...src(tuesday)}]};
 const p=normalizeAIPlan(x,meta(page));
 assert.deepEqual(p.attendance.map(x=>[x.day,x.group,x.time]),[
 ['Mandag','Rosa gruppe','08:05'],['Mandag','Lilla gruppe','08:05'],
 ['Tirsdag','Gul gruppe','08:15'],['Tirsdag','Grønn gruppe','08:15']]);
 assert.equal(verifiedAttendance({...x.attendance[1],day:'Mandag'},page),null);
});

test('Kilde må inneholde gruppen og tidspunktet i samme instruksjon',()=>{
 const full='Mandag: Rosa gruppe møter kl. 08.05. Blå gruppe møter kl. 09.15.';
 const forged={day:'Mandag',group:'Rosa gruppe',time:'09.15',text:'Møt ved inngangen',...src(full)};
 assert.deepEqual(verifiedAttendanceEntries(forged,full),[]);
 assert.deepEqual(verifiedAttendanceEntries({...forged,time:'08.15'},full),[]);
 assert.deepEqual(verifiedAttendanceEntries({...forged,group:'Grønn gruppe',time:'08.05'},full),[]);
 assert.equal(groupLabel('Rosa gruppe','En rosa vegg'),null);
});

test('PDF.js-tekst med to klokkeslett på én linje kobles til riktig gruppe',()=>{
 const quote='Mandag: Rosa og blå gruppe møter kl 08.05.';
 const page='Mandag Rosa og blå gruppe møter kl 08.05 Lilla gruppe møter kl 09.00';
 const item={day:'Mandag',group:'Rosa og blå gruppe',time:'08.05',text:'Møt ved skolen',...src(quote)};
 assert.deepEqual(verifiedAttendanceEntries(item,page).map(x=>x.group),['Rosa gruppe','Blå gruppe']);
});

test('Alle kjente fargegrupper får matchende CSS, ikke nøytral bakgrunn',()=>{
 const expected={rød:'group-red',grønn:'group-green',blå:'group-blue',gul:'group-yellow',
 oransje:'group-orange',lilla:'group-purple',rosa:'group-pink',turkis:'group-turquoise',
 brun:'group-brown',grå:'group-gray',hvit:'group-white',svart:'group-black'};
 const css=readFileSync(new URL('../public/original-look.css',import.meta.url),'utf8');
 for(const [color,style] of Object.entries(expected)){
  assert.equal(groupColorClass(color+' gruppe'),style);
  assert.ok(css.includes('.group-badge.'+style+'{')||css.includes('.'+style+'{'),color+' mangler CSS');
 }
 assert.equal(groupColorClass('3A'),'group-class');
 assert.match(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),/groupColorClass\(label\)/);
});

test('Flere aktiviteter samme klokkeslett vises samlet, uten å miste tekst og grupper',()=>{
 const entries=[
 {title:'Norsk',time:'09:00',group:'Rosa gruppe'},
 {title:'Lesing',time:'09:00',group:'Blå gruppe'},
 {title:'Matematikk',time:'10:00',group:null},
 {title:'Spisetid',time:null,group:null}
 ];
 const groups=groupSimultaneousEvents(entries);
 assert.equal(groups.length,3);
 assert.equal(groups[0].time,'09:00');
 assert.deepEqual(groups[0].entries.map(x=>x.title),['Norsk','Lesing']);
 assert.deepEqual(groups[0].entries.map(x=>x.group),['Rosa gruppe','Blå gruppe']);
 assert.equal(groups[1].time,'10:00');
 assert.equal(groups[2].time,null);
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(js,/groupedEvents\.map\(block/);
 assert.match(js,/class="event-subitem"/);
});

test('Vaksine i dagsprogrammet fremheves under Praktisk informasjon for dagen',()=>{
 assert.equal(isVaccineNotice('HPV-vaksine på tirsdag'),true);
 assert.equal(isVaccineNotice('Vaksinering kl 10.00'),true);
 assert.equal(isVaccineNotice('Tur til biblioteket'),false);
 const notes=notesWithImportantEvents([{title:'Vaksinasjon på skolen',time:'10:00',group:null}],
  [{text:'Ta med matpakke'}]);
 assert.equal(notes.length,2);
 assert.equal(notes[0].important,true);
 assert.match(notes[0].text,/10:00/);
 assert.match(notes[0].text,/Vaksinasjon/);
 assert.equal(notes[1].important,false);
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(js,/day-note-critical/);
 const css=readFileSync(new URL('../public/original-look.css',import.meta.url),'utf8');
 assert.match(css,/\.day-notes p\.day-note-critical/);
});

test('Bunntekst har rapporter feil og viser gyldig Git-SHA fra bygget',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const toml=readFileSync(new URL('../netlify.toml',import.meta.url),'utf8');
 assert.match(html,/mailto:mortenronn@gmail\.com/);
 assert.match(html,/id="git-version"/);
 assert.match(js,/showBuildVersion/);
 assert.match(js,/build-info\.json/);
 assert.match(toml,/scripts\/write-build-info\.mjs/);
 const sha='0123456789abcdef0123456789abcdef01234567';
 assert.equal(buildCommit({COMMIT_REF:sha},()=>{throw Error('should not run git');}),sha);
 assert.equal(buildCommit({},()=>sha),sha);
 assert.equal(buildCommit({},()=>{throw Error('no git');}),null);
});
