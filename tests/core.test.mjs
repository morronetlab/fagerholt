import test from 'node:test';
import assert from 'node:assert/strict';
import {osloCalendar,findPdfLinks,choosePdf,analyzePdfPages} from '../lib/plan-core.mjs';
const add=(items,text,x,y,w=60)=>items.push({text,x,y,width:w});
const names=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
const headers=(items,y=100)=>names.forEach((n,i)=>add(items,n,35+i*100,y));
test('ISO week Oslo even across year boundary',()=>{
 assert.deepEqual(osloCalendar(new Date('2026-10-26T09:00:00Z')).week,44);
 assert.deepEqual(osloCalendar(new Date('2027-01-01T09:00:00Z')).week,53);
 assert.deepEqual(osloCalendar(new Date('2027-01-04T09:00:00Z')).week,1);
 assert.equal(osloCalendar(new Date('2027-01-01T09:00:00Z')).year,2026);
});
test('discover current PDF only (stale weeks rejected)',()=>{
 const html='<h2>Ukeplan</h2><a href="/DynamicContent//Documents/plan-uke-44.pdf">Uke 44 PDF - 200KB</a><a href="/DynamicContent//Documents/plan-uke-43.pdf">Uke 43 PDF - 200KB</a>';
 const links=findPdfLinks(html,'https://www.minskole.no/fagerholt/seksjon/22636');
 assert.equal(links.length,2);
 assert.equal(choosePdf(links,44).week,44);
 assert.equal(choosePdf(links,45),null);
});
test('7th grade: recognize column events, stopping times, gear & homework',()=>{
 const items=[]; headers(items);
 add(items,'Tur til grønn slette. Ta med grillmat',35,146);
 add(items,'en vedkubbe og varme nok klær.',35,163);
 add(items,'Slutt: 14.15',35,217);
 add(items,'5-deling Husk innesko til sløyd!',135,146);
 add(items,'Slutt: 14.15',135,217);
 add(items,'Musikk',235,146); add(items,'Slutt 13.00',235,217);
 add(items,'Innegym - Husk innesko og gymtøy!',335,146);add(items,'Alle skal dusje!',335,165);add(items,'Slutt: 14.15',335,217);
 add(items,'Slutt 13.00',435,217);
 add(items,'Lekser:',40,272);
 add(items,'Norsk: Les 15 min hver dag.',35,314);
 add(items,'Engelsk: Skriv en halv side.',35,337);
 add(items,'Periode: Solidaritet',35,401);
 const first={width:555,height:800,items};
 const second={width:555,height:800,items:[{text:'INFORMASJON',x:35,y:50,width:100},{text:'Husk refleks på vei til skolen!',x:35,y:72,width:300},{text:'Mandag går vi på tur til Grønn slette.',x:35,y:120,width:380},{text:'Hilsen oss på 7.trinn',x:35,y:380,width:200}]};
 const g=analyzePdfPages([first,second],'7','https://www.minskole.no/abc.pdf',44,2026);
 assert.equal(g.days.Mandag.end,'14:15');
 assert.ok(g.days.Mandag.bring.some(x=>x.label==='Grillmat'));
 assert.ok(g.days.Mandag.bring.some(x=>x.label==='Én vedkubbe'));
 assert.ok(g.days.Tirsdag.bring.some(x=>x.label.includes('Innesko')));
 assert.ok(g.days.Torsdag.bring.some(x=>x.label==='Gymtøy'));
 assert.equal(g.days.Fredag.end,'13:00');
 assert.ok(g.homework.length>=2);
 assert.equal(g.status,'ok');
});
test('3rd grade: dates, swimming and 08.30-14.00 schedule parsed',()=>{
 const items=[];headers(items);
 ['08.30-14.00','08.30-14.00','08.30-13.00','08.30-13.00','08.30-13.00'].forEach((s,i)=>add(items,s,35+i*100,122));
 add(items,'08.05: Buss går til svømmingen.',35,145);
 add(items,'Svømming for alle',35,166);
 add(items,'Svømming for alle',135,166);
 add(items,'Halloween-kostymedag',435,161);
 add(items,'Innegym',435,185);
 add(items,'Dette skjer fremover:',35,310);
 const info=[{text:'Informasjon uke 44',x:20,y:50,width:150},{text:'Husk å ta med: Badetøy, håndkle og hårstrikk til svømming begge dagene.',x:20,y:90,width:540},{text:'Lekser uke 44',x:20,y:150,width:160},{text:'Norsk: Les teksten høyt for en voksen.',x:20,y:170,width:300}];
 const pages=[{width:550,height:700,items:info},{width:550,height:700,items}];
 const g=analyzePdfPages(pages,'3','https://www.minskole.no/def.pdf',44,2026);
 assert.equal(g.days.Mandag.start,'08:30');assert.equal(g.days.Mandag.end,'14:00');
 assert.ok(g.days.Mandag.bring.some(x=>x.label==='Badetøy'));
 assert.ok(g.days.Tirsdag.bring.some(x=>x.label==='Håndkle'));
 assert.ok(g.days.Fredag.bring.some(x=>x.label==='Kostyme'));
 assert.ok(g.homework.length);
});

test('red-group swimming times read from weekly table, without borrowing other week',async()=>{
 const {extractGroupSwimming,extractGroupMeetingTimes}=await import('../lib/plan-core.mjs');
 const table=[];
 add(table,'Plan for svømming',35,35,200);
 add(table,'Uke',35,70); add(table,'Dag',120,70);
 add(table,'(08.10) 08.30 - 10.00',285,70,136);
 add(table,'12.00 - 13.30',430,70,120);
 add(table,'44',35,110);add(table,'Mandag',120,110);
 add(table,'oransje, blå, grønn',288,110,130);
 add(table,'gul, rød, rosa',440,110,130);
 add(table,'Tirsdag',120,148);
 add(table,'gul, rød, rosa',288,148,130);
 add(table,'oransje, blå, grønn',440,148,130);
 add(table,'45',35,191);add(table,'Mandag',120,191);
 add(table,'gul, rød, rosa',288,191,130);
 add(table,'oransje, blå, grønn',440,191,130);
 add(table,'Tirsdag',120,230);
 add(table,'oransje, blå, grønn',288,230,130);
 add(table,'gul, rød, rosa',440,230,130);
 const page={width:600,height:440,items:table};
 assert.deepEqual(extractGroupSwimming([page],44),{
   Mandag:{period:'12:00–13:30',slot:'afternoon',source:'swimming-table'},
   Tirsdag:{period:'08:30–10:00',slot:'morning',source:'swimming-table'},
 });
 assert.deepEqual(extractGroupSwimming([page],45),{
   Mandag:{period:'08:30–10:00',slot:'morning',source:'swimming-table'},
   Tirsdag:{period:'12:00–13:30',slot:'afternoon',source:'swimming-table'},
 });
 const info={width:600,height:300,items:[
  {text:'Mandager: Oransje, blå og grønn gruppe møter kl. 08.05. De øvrige gruppene svømmer senere.',x:30,y:50,width:520},
  {text:'Tirsdager: Gul, rød og rosa gruppe møter kl. 08.05. De øvrige gruppene svømmer senere.',x:30,y:80,width:520},
 ]};
 assert.deepEqual(extractGroupMeetingTimes([info]),{Tirsdag:'08:05'});
});

test('third grade removes incorrect bus and keeps shared activity, safety notes and homework',async()=>{
 const {tailorThirdGradeRed}=await import('../lib/plan-core.mjs');
 const items=[];
 add(items,'Plan for svømming',35,35,200);
 add(items,'(08.10) 08.30 - 10.00',285,70,136);
 add(items,'12.00 - 13.30',430,70,120);
 add(items,'44',35,110);add(items,'Mandag',120,110);
 add(items,'oransje, blå, grønn',288,110,130);add(items,'gul, rød, rosa',440,110,130);
 add(items,'Tirsdag',120,148);add(items,'gul, rød, rosa',288,148,130);add(items,'oransje, blå, grønn',440,148,130);
 const info={width:600,height:290,items:[{text:'Tirsdager: Gul, rød og rosa gruppe møter kl. 08.05.',x:30,y:55,width:500}]};
 const plan={grade:'3',week:44,year:2026,status:'ok',notices:[{title:'Svømming',detail:'Svømming mandag og tirsdag. Badetøy og håndkle begge dagene.'},{title:'Refleks',detail:'Husk refleks på skoleveien.'}],homework:[{subject:'Norsk',detail:'Les i boka.'}],days:{
 Mandag:{start:'08:30',end:'14:00',subtitle:'Svømming for alle',events:[{title:'08.05 Oransje, blå og grønn gruppe. Svømming for alle. 10.15: Besøk fra den kulturelle skolesekken',detail:'',icon:'bus'}],bring:[{label:'Badetøy',note:'Til svømming'}],alert:'Oransje, blå og grønn gruppe buss 08:05'},
 Tirsdag:{start:'08:30',end:'14:00',subtitle:'Svømming for alle',events:[{title:'Svømming for alle'}],bring:[]},
 Onsdag:{events:[{title:'Tur til Grønn slette'}],bring:[]},
 Torsdag:{events:[],bring:[]},Fredag:{events:[],bring:[]},
 }};
 const p=tailorThirdGradeRed(plan,[{width:600,height:340,items},info]);
 assert.equal(p.group.key,'rød');
 assert.equal(p.status,'ok');
 assert.equal(p.days.Mandag.events.find(e=>e.icon==='waves').time,'12:00–13:30');
 assert.ok(!p.days.Mandag.events.some(e=>/08:05|08\.05|Oransje/i.test(JSON.stringify(e))));
 assert.ok(p.days.Mandag.events.some(e=>/kulturelle skolesekken/i.test(e.title)));
 assert.equal(p.days.Tirsdag.events.find(e=>e.icon==='bus').time,'08:05');
 assert.equal(p.days.Tirsdag.events.find(e=>e.icon==='waves').time,'08:30–10:00');
 assert.equal(p.days.Tirsdag.events[0].time,'08:05');
 assert.equal(p.days.Onsdag.events[0].title,'Tur til Grønn slette');
 assert.equal(p.homework[0].detail,'Les i boka.');
 assert.ok(p.notices.some(n=>n.title==='Refleks'));
 assert.ok(p.days.Mandag.bring.some(x=>x.label==='Håndkle'));
});

test('unknown red group swimming time must be flagged, never mistaken as 08:05',async()=>{
 const {tailorThirdGradeRed}=await import('../lib/plan-core.mjs');
 const p=tailorThirdGradeRed({grade:'3',week:46,status:'ok',days:{Mandag:{events:[{title:'Svømming for alle, oransje blå grønn buss kl 08.05'}],bring:[]}},notices:[]},[]);
 assert.equal(p.status,'partial');
 assert.match(p.days.Mandag.alert,/sjekk svømmetid/i);
 assert.ok(!JSON.stringify(p.days.Mandag.events).includes('08:05'));
});

test('3rd grade: real heading Engelsklekse belongs to Engelsk, not Norsk',async()=>{
 const {extractHomework}=await import('../lib/plan-core.mjs');
 const items=[];
 add(items,'Lekser uke 44',30,20,180);
 add(items,'Norsk(ukelekse): Les teksten høyt for en voksen og svar skriftlig.',30,65,450);
 add(items,'Engelsklekse til neste engelsktime: Øve på høyfrekvente ord.',30,108,480);
 add(items,'Les og oversett s. 34 eller s. 35 sammen med en voksen.',30,135,480);
 add(items,'Tlf til arbeidsrom 3. trinn: 47716783',30,172,340);
 const h=extractHomework([{width:600,height:280,items}]);
 assert.equal(h.length,2);
 assert.equal(h[0].subject,'Norsk');
 assert.equal(h[1].subject,'Engelsk');
 assert.doesNotMatch(h[0].detail,/høyfrekvente|oversett/i);
 assert.match(h[1].detail,/oversett/i);
});

test('red-group swim requires badetøy and håndkle even with no extracted gear note',async()=>{
 const {tailorThirdGradeRed}=await import('../lib/plan-core.mjs');
 const p=tailorThirdGradeRed({grade:'3',week:44,status:'ok',days:Object.fromEntries(names.map(n=>[n,{events:n==='Mandag'||n==='Tirsdag'?[{title:'Svømming for alle'}]:[],bring:[]}])) ,notices:[]},[]);
 for(const name of ['Mandag','Tirsdag']){
   const labels=p.days[name].bring.map(x=>x.label);
   assert.ok(labels.includes('Badetøy'),name);
   assert.ok(labels.includes('Håndkle'),name);
 }
 assert.equal(p.days.Onsdag.bring.length,0);
});

test('strip PDF link, icon and swimming-table bleed without removing real day info',()=>{
 const items=[];headers(items);
 add(items,'08.30 - 14.00',35,120);
 add(items,'Svømming for alle',35,150);
 add(items,'Les mer her (08.10) 08.30 - 10.00',235,170);
 add(items,'oransje, blå, grønn gul, rød, rosa',235,190);
 add(items,'svg',235,209);
 add(items,'Dette skjer fremover:',260,240);
 add(items,'Plan for svømming',260,273);
 add(items,'Planleggingsdager - skole og SFO stengt',235,290);
 const g=analyzePdfPages([{width:550,height:560,items}], '3', 'https://www.minskole.no/a.pdf',44,2026);
 assert.equal(g.days.Mandag.events.filter(x=>/svømm/i.test(x.title)).length,1);
 const wed=JSON.stringify(g.days.Onsdag);
 assert.doesNotMatch(wed,/les mer her|svg|oransje|svømmetabell|planleggingsdager/i);
});

test('penal and skiftetøy never enter the daily or everyday checklists',()=>{
 const items=[];headers(items);
 add(items,'Penal, skiftetøy og gymtøy',335,150);
 add(items,'Dette skjer fremover:',35,250);
 add(items,'Huskeliste:',30,310);
 add(items,'Sekken: postmappe og penal. Husk skiftetøy.',30,338);
 const p=analyzePdfPages([{width:550,height:550,items}], '7','https://www.minskole.no/a.pdf',44,2026);
 assert.ok(p.days.Torsdag.bring.some(x=>x.label==='Gymtøy'));
 assert.ok(![...p.days.Torsdag.bring,...p.everyday].some(x=>/penal|skiftetøy/i.test(x.label)));
});
