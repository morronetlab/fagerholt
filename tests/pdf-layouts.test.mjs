import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePdfPages,extractDayRows,extractDaySections,extractHomeworkGrid} from '../lib/plan-core.mjs';
import {DAYS} from '../lib/calendar.mjs';
const item=(text,x,y)=>({text,x,y,width:Math.min(125,text.length*4)});
const wrap=items=>[{width:800,height:950,items}];
const parse=(items,grade)=>analyzePdfPages(wrap(items),grade,'https://www.minskole.no/sample.pdf',44,2026,`https://www.minskole.no/fagerholt/seksjon/${22633+Number(grade)}`);

test('5th: Dag | På skolen | I lekse rows preserve all weekdays and wrapped homework',()=>{
 const words=[item('Dag',20,80),item('På skolen',150,80),item('I lekse',540,80)];
 for(let i=0;i<5;i++) {
   const y=130+i*140;
   words.push(item(DAYS[i],20,y),item('8.30-14.15',20,y+20),item(`Norsk: ${DAYS[i]} har lesing`,150,y+15));
 }
 words.push(item('Lesing/engelsk:',540,145),item('Les minst 20 minutter',540,161),item('hver dag i engelsk bok.',540,178));
 words.push(item('Innegym: Husk gymtøy!',150,285));
 const data=parse(words,'5');
 assert.equal(data.layout,'day-rows');
 assert.equal(data.status,'ok');
 assert.ok(DAYS.every(day=>data.days[day].events.length>0));
 assert.match(data.homework.map(x=>x.text).join(' '),/20 minutter.*hver dag/i);
 assert.ok(data.days.Tirsdag.bring.some(x=>x.label==='Gymtøy'));
 assert.ok(!data.days.Mandag.bring.some(x=>x.label==='Gymtøy'));
});

test('4th: five-column Fagerholt-style week and explicit items',()=>{
 const words=DAYS.map((day,i)=>item(day,60+i*140,45));
 DAYS.forEach((day,i)=>words.push(item(`${day}: Fag og oppgaver`,60+i*140,90)));
 words.push(item('Ta med: badetøy, håndkle',60+2*140,123));
 words.push(item('Lekser',20,200),item('Norsk: Les 15 minutter',20,227),item('Matte: Oppgaver side 8',20,253));
 const data=parse(words,'4');
 assert.equal(data.layout,'five-columns');
 assert.equal(data.status,'ok');
 assert.ok(data.days.Onsdag.bring.some(x=>x.label==='Badetøy'));
 assert.ok(data.homework.length>=2);
});

test('6th: separately headed day list and day-specific homework',()=>{
 const words=[];for(let i=0;i<5;i++){
   const y=40+i*135;
   words.push(item(`${DAYS[i]} på skolen`,20,y),item('Norsk: leseoppgaver',20,y+17),item(`Hjemmelekse ${DAYS[i]}`,20,y+43),item('Matte: Øv på gangetabellen',20,y+63));
 }
 const data=parse(words,'6');
 assert.equal(data.layout,'day-sections');
 assert.ok(DAYS.every(day=>data.days[day].events.length));
 assert.ok(data.homework.length>0);
});

test('6th: separate homework matrix with til-tirsdag columns',()=>{
 const words=[item('Ukas utfordringer',10,40),item('til tirsdag',160,40),item('til onsdag',320,40),item('til torsdag',480,40),item('Fredag',640,40),
 item('Matte',10,90),item('Regn stykkene i boka',160,91),item('Skriv et resymé',320,91),item('Les engelsk',480,91),item('Norsk',10,125),
 item('Læringsmål',10,280)];
 const tasks=extractHomeworkGrid(wrap(words));
 assert.ok(tasks.some(x=>/Regn stykkene/.test(x)));
 assert.ok(tasks.some(x=>/resymé/.test(x)));
 assert.ok(tasks.every(x=>!x.includes('Læringsmål')));
});

test('No guessed gymtøy based on gym subject alone',()=>{
 const words=[...DAYS.map((d,i)=>item(d,20+i*140,50)),item('Gym',160,90),item('Husk gymtøy',300,90)];
 const data=parse(words,'6');
 assert.deepEqual(data.days.Tirsdag.bring,[]);
 assert.deepEqual(data.days.Onsdag.bring.map(x=>x.label),['Gymtøy']);
});

test('Fagerholt 4, weeks 35–36: Til torsdag applies to the English homework cell only',()=>{
 // Actual school PDFs have a separate "Til torsdag:" line above "ENGELSK:"
 // in the Thursday homework cell. Coordinates below model that source layout.
 const words=[item('Dag',20,80),item('På skolen',150,80),item('I lekse',540,80)];
 for(let i=0;i<5;i++){
   const y=130+i*140;
   words.push(item(DAYS[i],20,y),item('Norsk: Verb',150,y+12));
 }
 words.push(item('NORSK:',540,147),item('Les teksten i Zeppelin lesebok',540,165));
 words.push(item('Til torsdag:',540,565),item('ENGELSK:',540,583),
   item('Les 10 minutter i den engelske boka',540,600));
 // Synthetic guard: a later homework cell must not inherit Thursday.
 words.push(item('Matte: Selvstendig fredagsoppgave',540,708));
 const plan=parse(words,'4');
 assert.equal(plan.layout,'day-rows');
 const english=plan.homework.find(x=>/10 minutter i den engelske boka/i.test(x.text));
 assert.ok(english,'English homework from Thursday should be retained');
 assert.equal(english.dueDay,'Torsdag');
 const norwegian=plan.homework.find(x=>/Zeppelin lesebok/i.test(x.text));
 assert.ok(norwegian);
 assert.equal(norwegian.dueDay,null,'Do not infer the deadline from another cell');
 const friday=plan.homework.find(x=>/Selvstendig fredagsoppgave/i.test(x.text));
 assert.ok(friday);
 assert.equal(friday.dueDay,null,'The next row must not inherit Thursday');
});
