import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzePdfPages,extractDayRowsFallback} from '../lib/plan-core.mjs';

const token=(text,x,y)=>({text,x,y,width:Math.min(175,Math.max(8,text.length*4))});
const page=(items,height=850)=>({width:800,height,items});
const result=(pages,grade)=>analyzePdfPages(pages,grade,'https://www.minskole.no/eksempel-uke44.pdf',44,2026,'https://www.minskole.no/fagerholt/seksjon/22638');

test('4th: overdue headings do not become empty tasks; loose learning-goal sections are reclassified',()=>{
 const pdf=page([
  token('Læringsmål',25,20),
  token('Jeg kan forklare en multiplikasjon',25,45),
  token('Les side 22 i leseboka',25,65),
  token('Til torsdag:',25,95),
  token('Norsk: Les side 35 og svar på spørsmålene',25,118),
  token('Beskjeder fra skolen',25,155),
  token('Vi minner foresatte om foreldremøtet',25,177),
  token('Torsdag – turdag, møt opp 08:30',25,209),
  token('Husk gymtøy torsdag',25,235),
  token('Informasjon til foresatte',25,269),
  token('Kontaktlærer sender oppdatert plan',25,293),
  token('Fag denne uka',25,325),
  token('Matte: Brøk og måling',25,350),
  token('Ukas tema',25,392),token('Verdensrommet',25,415)
 ]);
 const data=result([pdf],'4');
 assert.ok(!data.homework.some(x=>/^\s*til torsdag\s*:\s*$/i.test(x.text)));
 assert.ok(data.homework.some(x=>/Til torsdag.*Les side 35/i.test(x.text)));
 assert.ok(data.homework.some(x=>/Les side 22/i.test(x.text)));
 assert.deepEqual(data.learningGoals,['Jeg kan forklare en multiplikasjon']);
 assert.ok(data.notices.some(x=>/foreldremøtet/i.test(x)));
 assert.ok(data.notices.some(x=>/Kontaktlærer sender/i.test(x)));
 assert.ok(data.days.Torsdag.events.some(x=>/turdag/.test(x.title)));
 assert.ok(data.days.Torsdag.bring.some(x=>x.label==='Gymtøy'));
 assert.ok(data.subjects.some(x=>/Brøk og måling/.test(x)));
 assert.equal(data.weekTheme,'Verdensrommet');
});

test('5th: realistic Fagerholt Dag | På skolen | I lekse PDF yields 5 days, proper homework, gear and notices',()=>{
 const items=[
  token('UKEPLAN FOR 5. trinn',25,10), token('UKE 46',25,32),
  token('Sosialt: Jeg er kjapp ut og inn fra friminuttene.',25,55),
  token('Matte: Jeg kan vise sammenhengen mellom multiplikasjon og divisjon.',25,75),
  token('Dag',25,110), token('På skolen',160,110),token('I lekse',520,110)
 ];
 const days=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
 days.forEach((day,i)=>{
  const y=145+i*125;
  items.push(token(day,25,y),token('8.30-14.15',25,y+20));
  items.push(token('Norsk: Lesing',160,y+16),token('Matematikk: Multiplikasjon',160,y+39));
 });
 items.push(token('Lesing/engelsk:',520,150),token('Les minst 20 minutter hver',520,170),token('dag i engelsk bok.',520,190));
 items.push(token('Matematikk:',520,220),token('Jobb i Mattelabben.',520,238));
 items.push(token('Innegym: Husk gymtøy!',160,290));
 const info=page([token('INFORMASJON',25,30),token('Elevundersøkelsen gjennomføres snart.',25,65),token('Det kommer beskjed fra skolen.',25,90),token('Dato Hva',25,140),token('Mandag 17. nov Forskerkonferanse på UiA',25,166)]);
 const data=result([page(items),info],'5');
 assert.equal(data.layout,'day-rows');
 assert.ok(days.every(day=>data.days[day].events.length>=2));
 assert.ok(data.days.Tirsdag.bring.some(x=>x.label==='Gymtøy'));
 assert.ok(data.homework.some(x=>/20 minutter.*engelsk bok/i.test(x.text)));
 assert.ok(data.homework.some(x=>/Mattelabben/i.test(x.text)));
 assert.ok(data.learningGoals.some(x=>/multiplikasjon/.test(x)));
 assert.ok(data.notices.some(x=>/Elevundersøkelsen/.test(x)));
 assert.ok(!data.days.Mandag.events.some(x=>/17. nov/.test(x.title)));
});

test('5th: row-table fallback handles split or merged headers',()=>{
 const items=[token('Dag På skolen I lekse',18,60)];
 ['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'].forEach((day,i)=>{
   const y=110+i*90;
   items.push(token(day,18,y),token('Norsk: les og skriv',155,y+5),token('Matte: regn i boka',155,y+27),token('Les 15 minutter',625,y+5));
 });
 const data=result([page(items)],'5');
 assert.equal(data.layout,'day-rows-fallback');
 assert.ok(data.days.Torsdag.events.some(x=>/Norsk/.test(x.title)));
 assert.ok(data.homework.some(x=>/15 minutter/.test(x.text)));
 assert.ok(extractDayRowsFallback([page(items)]));
});

test('6th: weekly subject overview is not a theme; dated daily notices move to corresponding school days',()=>{
 const pdf=page([
  token('Fag denne uka',20,20),token('Norsk: Eventyr',20,45),token('Naturfag: Planter',20,65),
  token('Beskjeder fra skolen',20,100),
  token('Mandag – vi skal på biblioteket',20,125),
  token('Ta med: biblioteksbok',20,146),
  token('Onsdag: Vi skal på uteskole',20,185),
  token('Husk gymtøy!',20,210),
  token('Informasjon til foresatte',20,255),
  token('Foreldremøte neste uke på skolen',20,280)
 ]);
 const data=result([pdf],'6');
 assert.equal(data.weekTheme,null);
 assert.ok(data.subjects.some(x=>/Eventyr/.test(x)));
 assert.ok(data.days.Mandag.events.some(x=>/biblioteket/.test(x.title)));
 assert.ok(data.days.Mandag.bring.some(x=>/biblioteksbok/i.test(x.label)));
 assert.ok(data.days.Onsdag.events.some(x=>/uteskole/.test(x.title)));
 assert.ok(data.days.Onsdag.bring.some(x=>x.label==='Gymtøy'));
 assert.ok(data.notices.some(x=>/Foreldremøte/.test(x)));
 assert.ok(!data.notices.some(x=>/biblioteket|uteskole/.test(x)));
});

test('UI renders subject overview separately from the theme card',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(html,/id="subjects-panel"/);
 assert.match(html,/id="subjects-list"/);
 assert.match(app,/\$\('subjects-panel'\)\.hidden/);
 assert.doesNotMatch(app,/mission-slot'\)\.innerHTML=\(subjects\.length/);
});

test('4th: homework due-date grid without separate title extracts assignments, not blank headings',()=>{
 const pageData=page([
   token('Til tirsdag',170,70),token('Til onsdag',360,70),token('Til torsdag:',550,70),
   token('Les i norskboka',170,108),token('Øv på glosene',360,108),token('Gjør oppgave 12',550,108),
   token('Læringsmål',20,250),token('Jeg kan lese',20,280)
 ]);
 const data=result([pageData],'4');
 assert.ok(data.homework.some(x=>x.dueDay==='Torsdag'&&/Gjør oppgave 12/i.test(x.text)));
 assert.ok(data.homework.every(x=>!/^Til\s+\w+:\s*$/.test(x.text)));
 assert.deepEqual(data.learningGoals,['Jeg kan lese']);
});

test('ordinary five-day timetable is never added as homework',()=>{
 const items=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'].map((name,i)=>token(name,20+i*145,50));
 items.push(token('Matematikk',20,100),token('Norsk',165,100),token('Gym',310,100));
 const data=result([page(items)],'4');
 assert.deepEqual(data.homework,[]);
});
