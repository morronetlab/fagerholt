import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceRepeatDays,verifiedRepeatDays} from '../lib/homework-days.mjs';
import {expandHomework} from '../public/shared/homework-view.mjs';
import {normalizeAIPlan,AI_SCHEMA_VERSION,SYSTEM_PROMPT} from '../lib/ai-plan.mjs';
import {planFeedback} from '../public/shared/plan-feedback.mjs';
import {homeworkProgress} from '../public/shared/group-scope.mjs';
const days=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
const quote='Les 15 minutter i valgfri bok mandag, tirsdag, onsdag og torsdag';
const ref={sourcePage:1,sourceQuote:quote};
const raw={days:[],attendance:[],homework:[{subject:'Norsk',text:'Les 15 minutter i valgfri bok',dueDay:null,repeatDays:days.slice(0,4),group:null,...ref}],packing:[],notices:[],learningGoals:[],subjects:[],specialContent:[],weekTheme:{text:null,sourcePage:null,sourceQuote:''},optionalMission:{text:null,sourcePage:null,sourceQuote:''},coverage:{state:'complete',reason:''}};
const meta={grade:'6',week:44,year:2026,source:'https://www.minskole.no/dvergsnes/seksjon/987',pdf:'https://www.minskole.no/Documents/uke44.pdf',pageCount:1,pageTexts:[quote]};
const file=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('Dvergsnes: reading Monday through Thursday can be checked off separately',()=>{
 const plan=normalizeAIPlan(raw,meta);
 assert.equal(AI_SCHEMA_VERSION,16);
 assert.deepEqual(plan.homework[0].repeatDays,days.slice(0,4));
 const tasks=expandHomework(plan.homework);
 assert.deepEqual(tasks.map(t=>t.repeatDay),days.slice(0,4));
 assert.deepEqual(homeworkProgress(tasks,i=>i<2),{total:4,done:2,percent:50,complete:false});
});
test('Wilds Minne: reading every day spans all five weekdays',()=>{
 const sentence='Leselekse: les i boka hver dag';
 assert.deepEqual(sourceRepeatDays(sentence,sentence),days);
 assert.deepEqual(verifiedRepeatDays({sourceQuote:sentence,repeatDays:days},sentence),days);
});
test('A Tuesday due date is not a recurring Tuesday assignment',()=>{
 assert.deepEqual(sourceRepeatDays('Norsk til tirsdag','Norsk til tirsdag og tur onsdag'),[]);
 const x=structuredClone(raw);x.homework[0].sourceQuote='Les teksten til tirsdag';x.homework[0].repeatDays=days;
 assert.deepEqual(normalizeAIPlan(x,{...meta,pageTexts:['Les teksten til tirsdag']}).homework[0].repeatDays,[]);
});
test('Torridal extra information retains source reference even if image crop is unsafe',()=>{
 const sentence='Ekstra informasjon: Fakta om natur og dyr';
 const x={...raw,homework:[],specialContent:[{title:'Ekstra informasjon',description:'Fakta om natur og dyr',kind:'feature',hasVisual:true,group:null,visualRegion:null,sourcePage:1,sourceQuote:sentence}]};
 const p=normalizeAIPlan(x,{...meta,pageTexts:[sentence]});
 assert.equal(p.specialContent[0].title,'Ekstra informasjon');
 assert.equal(p.specialContent[0].hasVisual,false);
 assert.match(SYSTEM_PROMPT,/Ekstra informasjon/);
});
test('Estimated AI percent never reaches 100 before completion, and interim content is hidden',()=>{
 const feedback=planFeedback({school:{name:'Testskole',homepage:'https://www.minskole.no/test'},grade:'5',plan:{aiStatus:'processing',status:'partial',parsedFromPdf:true}});
 assert.equal(feedback.hideContent,true);
 const html=file('../public/index.html'),js=file('../public/app.js'),css=file('../public/original-look.css');
 for(const x of ['id="analysis-percent"','id="analysis-progress-track"','id="analysis-progress-fill"','id="plan-columns"'])assert.ok(html.includes(x));
 assert.match(js,/estimatedPercent\(/);assert.match(js,/\$\('plan-body'\)\.hidden=state\.loading\|\|pending/);
 assert.match(css,/#plan-body\[hidden\]/);
});
test('Empty packing list uses full-width day program and compact packing strip',()=>{
 const js=file('../public/app.js'),css=file('../public/original-look.css');
 assert.match(js,/classList\.toggle\('bag-empty'/);assert.match(css,/\.columns\.bag-empty\{grid-template-columns:minmax\(0,1fr\)\}/);
});
