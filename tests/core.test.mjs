import test from 'node:test';import assert from 'node:assert/strict';
import {siteConfig} from '../public/site-config.mjs';
import {schoolCalendar,dayDate,DAYS} from '../lib/calendar.mjs';
import {gradeSelectionKey,validGrade,progressKey} from '../lib/selection.mjs';
import {findPdfLinks,choosePdf,analyzePdfPages,linesFromPage} from '../lib/plan-core.mjs';
import {summarizeForecast} from '../lib/weather-core.mjs';

test('Fagerholt school pages configured for exactly grades 1-7',()=>{
 assert.deepEqual(Object.keys(siteConfig.school.grades),['1','2','3','4','5','6','7']);
 for(const [g,url] of Object.entries(siteConfig.school.grades))assert.equal(url,`https://www.minskole.no/fagerholt/seksjon/${22633+Number(g)}`);
});
test('selection and progress scoped per school, grade, week, and day',()=>{
 assert.notEqual(gradeSelectionKey('a'),gradeSelectionKey('b'));
 assert.equal(validGrade('1',siteConfig.school.grades),true);
 assert.equal(validGrade('8',siteConfig.school.grades),false);
 assert.equal(validGrade(undefined,siteConfig.school.grades),false);
 assert.notEqual(progressKey('s','1',2026,44,'bag','Mandag'),progressKey('s','2',2026,44,'bag','Mandag'));
 assert.notEqual(progressKey('s','1',2026,44,'bag','Mandag'),progressKey('s','1',2026,44,'bag','Tirsdag'));
});
test('ISO week in Oslo, around new year and current fixture',()=>{
 const d=schoolCalendar(new Date('2026-10-27T12:00:00Z'));
 assert.deepEqual([d.year,d.week,d.weekday],[2026,44,1]);
 assert.equal(dayDate(2026,44,0),'2026-10-26');
 assert.equal(dayDate(2026,44,4),'2026-10-30');
 assert.deepEqual([schoolCalendar(new Date('2021-01-01T11:00:00Z')).year,schoolCalendar(new Date('2021-01-01T11:00:00Z')).week],[2020,53]);
});
test('PDF links only select requested week and approved HTTPS host',()=>{
 const base=siteConfig.school.grades['1'];
 const html=`<a href="/fagerholt/files/uke43.pdf">Uke 43</a><a href="/fagerholt/files/uke44.pdf">Uke 44</a><a href="https://evil.test/uke44.pdf">Uke 44</a><a href="http://www.minskole.no/uke44.pdf">Uke 44</a>`;
 const links=findPdfLinks(html,base,siteConfig.allowedSourceHosts);
 assert.equal(links.length,2);
 assert.equal(choosePdf(links,44).week,44);
 assert.equal(choosePdf(links,45),null);
});
test('PDF parser returns only grounded records, leaves unknown subjects empty',()=>{
 const one=(text,x,y)=>({text,x,y,width:Math.max(10,text.length*4)});
 const page={width:650,height:820,items:[
  ...DAYS.map((x,i)=>one(x,20+i*125,40)),
  one('Norsk',28,80),one('Matte',153,80),one('Uteskole',278,80),one('Naturfag',403,80),one('Engelsk',528,80),
  one('Lekser',20,180),one('Norsk: Les i boken',20,205),one('Matte: Tell til hundre',20,228),
  one('Læringsmål',20,265),one('Jeg kan lese ord',20,290),
  one('Ukas tema',20,330),one('Høsten',20,350),
  one('Frivillig oppdrag',20,385),one('Finn et blad',20,410),
  one('Beskjeder',20,440),one('Fotografering onsdag',20,460)]};
 const data=analyzePdfPages([page],'1','https://www.minskole.no/a.pdf',44,2026,siteConfig.school.grades['1']);
 assert.equal(data.status,'ok');
 assert.equal(data.days.Mandag.events[0].title,'Norsk');
 assert.equal(data.homework[0].subject,'Norsk');
 assert.equal(data.weekTheme,'Høsten');
 assert.equal(data.optionalMission,'Finn et blad');
 assert.deepEqual(data.learningGoals,['Jeg kan lese ord']);
 assert.deepEqual(data.notices,['Fotografering onsdag']);
 assert.deepEqual(data.days.Mandag.bring,[]);
});
test('empty PDF produces honest unreadable response, no hardcoded events',()=>{
 const data=analyzePdfPages([{width:300,height:400,items:[]}],'6','https://www.minskole.no/a.pdf',44,2026,siteConfig.school.grades['6']);
 assert.equal(data.status,'unreadable');assert.deepEqual(data.homework,[]);
 assert.ok(Object.values(data.days).every(x=>x.events.length===0));
});
test('MET summarizer uses only available selected-day measurements',()=>{
 const json={properties:{timeseries:[{time:'2026-10-27T11:00:00Z',data:{instant:{details:{air_temperature:9}},next_1_hours:{summary:{symbol_code:'rain'},details:{precipitation_amount:1.5}}}}]}};
 const days=summarizeForecast(json);
 assert.equal(days['2026-10-27'].rainMm,1.5);
 assert.equal(days['2026-10-27'].temperature,9);
 assert.equal(days['2026-10-27'].icon,'🌧️');
 assert.throws(()=>summarizeForecast({}),/Ugyldig/);
});
test('realistic Fagerholt-style headings keep school data in correct sections',()=>{
 const token=(text,y)=>({text,x:20,y,width:400});
 const p={width:650,height:820,items:[
  token('Periode: Solidaritet',10),token('Tema: Jeg bryr meg',30),
  token('Læringsmål:',60),token('Norsk: Jeg kan lage et tankekart.',80),
  token('Tema - Dette jobber vi med denne uka:',105),token('Matte Multiplikasjon',125),
  token('Informasjon uke 44',170),token('Svømming: Alle elevene skal svømme.',190),
  token('Huskeliste:',210),token('Husk innesko/gymsko',230),
  token('Lekser uke 44',250),token('Norsk: Les teksten høyt',270),
  token('Oversikt/huskeliste for uke 44',305)
 ]};
 const data=analyzePdfPages([p],'3','https://www.minskole.no/demo.pdf',44,2026,'https://www.minskole.no/fagerholt/seksjon/22636');
 assert.equal(data.weekTheme,'Solidaritet · Jeg bryr meg');
 assert.deepEqual(data.learningGoals,['Norsk: Jeg kan lage et tankekart.']);
 assert.deepEqual(data.subjects,['Matte Multiplikasjon']);
 assert.deepEqual(data.homework.map(x=>x.text),['Norsk: Les teksten høyt']);
 assert.ok(data.notices.some(x=>x.includes('Svømming')));
 assert.deepEqual(data.everyday.map(item=>item.label),['Gymsko']); // explicit 'Husk innesko/gymsko' is a packing instruction
});
