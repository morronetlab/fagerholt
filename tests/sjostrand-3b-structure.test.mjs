import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeAIPlan,AI_SCHEMA_VERSION,AI_SCHEMA,SYSTEM_PROMPT} from '../lib/ai-plan.mjs';
import {isWeekwideText,verifiedHomeworkDay,recoverWordLists,verifiedTeacher} from '../lib/school-content.mjs';
const document='https://www.minskole.no/DynamicContent/Documents/sjostrand-uke44.pdf';
const meta=pageTexts=>({grade:'3B',week:44,year:2026,source:'https://www.minskole.no/sjostrand/seksjon/22172',pdf:document,pageCount:1,pageTexts});
const source=text=>({sourcePage:1,sourceQuote:text});
const base=()=>({days:[],attendance:[],dayNotes:[],weekInfo:[],wordLists:[],teachers:[],homework:[],packing:[],notices:[],learningGoals:[],subjects:[],specialContent:[],weekTheme:{text:null,sourcePage:null,sourceQuote:''},optionalMission:{text:null,sourcePage:null,sourceQuote:''},coverage:{state:'complete',reason:''}});
const file=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('3B: generell ukeinformasjon flyttes bort fra mandagens dagsprogram',()=>{
 const week='Denne uka jobber vi med vennskap og været.';
 const monday='Mandag: Tur til skogen.';
 const raw=base();
 raw.days=[{day:'Mandag',events:[{title:week,time:null,group:null,...source(week)},{title:'Tur til skogen',time:null,group:null,...source(monday)}]}];
 const result=normalizeAIPlan(raw,meta([week+' '+monday]));
 assert.deepEqual(result.days.Mandag.events.map(e=>e.title),['Tur til skogen']);
 assert.deepEqual(result.weekInfo,[week]);
 assert.equal(isWeekwideText('Ukas tema: Vennskap'),true);
 assert.equal(isWeekwideText('Mandag jobber vi med vennskap'),false);
 assert.match(SYSTEM_PROMPT,/KUN aktiviteter og beskjeder som GJELDER DEN ANGITTE UKEDAGEN/);
});
test('Lekser til tirsdag/onsdag som overskrifter valideres separat mot egen oppgavetekst',()=>{
 const pdf='Lekser til tirsdag Norsk: Les side 12 i boka. Matte: Øv på tieroverganger. Lekser til onsdag Engelsk: Les side 18.';
 const raw=base();
 raw.homework=[
 {dueDay:null,repeatDays:[],subject:'Norsk',text:'Les side 12 i boka.',group:null,...source('Norsk: Les side 12 i boka.')},
 {dueDay:null,repeatDays:[],subject:'Matte',text:'Øv på tieroverganger.',group:null,...source('Matte: Øv på tieroverganger.')},
 {dueDay:'Onsdag',repeatDays:[],subject:'Engelsk',text:'Les side 18.',group:null,...source('Engelsk: Les side 18.')}
 ];
 const result=normalizeAIPlan(raw,meta([pdf]));
 assert.deepEqual(result.homework.map(x=>x.dueDay),['Tirsdag','Tirsdag','Onsdag']);
 assert.equal(verifiedHomeworkDay({sourceQuote:'Norsk: Les side 12 i boka.',text:'Les side 12 i boka.'},'Lekser til onsdag Helt annet arbeid. Norsk: Les side 12 i boka.'),'Onsdag');
 assert.equal(verifiedHomeworkDay({sourceQuote:'Kunst og håndverk',text:'Helt ukjent'},pdf),null);
});
test('Ukas ord og engelske ord vises sammen men beholder separate overskrifter',()=>{
 const text='Ukas ord: vennskap, hilse, lære. Engelske ord: hello = hei, thank you = takk.';
 const raw=base();
 raw.wordLists=[
 {title:'Ukas ord',text:'vennskap, hilse, lære',...source(text)},
 {title:'Engelske ord',text:'hello = hei, thank you = takk',...source(text)}];
 const plan=normalizeAIPlan(raw,meta([text]));
 assert.equal(plan.wordLists.length,2);
 assert.deepEqual(plan.wordLists.map(x=>x.title),['Ukas ord','Engelske ord']);
 assert.equal(AI_SCHEMA_VERSION,13);
 assert.ok(AI_SCHEMA.required.includes('wordLists'));
 assert.match(file('../public/index.html'),/id="word-lists-panel"/);
 assert.match(file('../public/app.js'),/word-lists-content/);
 const recovered=recoverWordLists([text],[]);
 assert.deepEqual(recovered.map(x=>x.title),['Ukas ord','Engelske ord']);
});
test('Kontaktlærer offentliggjort i original PDF vises med bare dokumenterte kontaktdata',()=>{
 const quote='Kontaktlærer: Kari Nordmann. E-post: kari.nordmann@skole.no. Telefon: 900 00 000.';
 const raw=base();raw.teachers=[{name:'Kari Nordmann',role:'Kontaktlærer',email:'kari.nordmann@skole.no',phone:'90000000',...source(quote)}];
 const plan=normalizeAIPlan(raw,meta([quote]));
 assert.deepEqual(plan.teachers.map(x=>[x.name,x.email,x.phone]),[['Kari Nordmann','kari.nordmann@skole.no','90000000']]);
 assert.equal(verifiedTeacher({...raw.teachers[0],email:'oppdiktet@skole.no'},quote).email,null);
 assert.equal(verifiedTeacher({...raw.teachers[0],name:'Ukjent Navn'},quote),null);
 assert.match(file('../public/index.html'),/id="teachers-panel"/);
 assert.match(file('../public/app.js'),/teachers-list/);
});
test('Kontaktlærer uten oppgitt e-post/telefon beholdes uten oppdiktede lenker',()=>{
 const quote='Kontaktlærer: Ole Olsen. Send melding via Visma.';
 const raw=base();raw.teachers=[{name:'Ole Olsen',role:'Kontaktlærer',email:null,phone:null,...source(quote)}];
 const result=normalizeAIPlan(raw,meta([quote]));
 assert.equal(result.teachers.length,1);
 assert.equal(result.teachers[0].email,null);
 assert.equal(result.teachers[0].phone,null);
});
