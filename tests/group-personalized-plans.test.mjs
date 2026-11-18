import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {groupMatches,targetGroupIds,vocabularyForProfile} from '../public/shared/group-scope.mjs';
import {groupApplies,profileSummary} from '../public/shared/family-core.mjs';
import {scopedHomeworkItems,scopedPackingItems,childSchoolDayDetails} from '../public/barn/child-learning.mjs';
import {quizItems} from '../public/shared/word-quiz-core.mjs';
import {normalizeAIPlan,AI_SCHEMA,AI_SCHEMA_VERSION,SYSTEM_PROMPT} from '../lib/ai-plan.mjs';
import {dayDate} from '../public/shared/calendar.mjs';
import {practicalHighlights} from '../public/shared/practical-highlights.mjs';

const red={id:'child-red-1234',name:'Rød elev',grade:'3',school:'fagerholt',group:'Rød gruppe'};
const blue={...red,id:'child-blue-1234',name:'Blå elev',group:'Blå gruppe'};
const unknown={...red,id:'child-unknown-1234',name:'Ukjent gruppe',group:''};
const week={year:2026,week:47,today:dayDate(2026,47,2),upcoming:false};
const plan={year:2026,week:47,status:'ok',aiStatus:'ready',parser:'ai',
 homework:[
  {subject:'Norsk',text:'Les 10 minutter',dueDay:'Torsdag'},
  {subject:'Matte',text:'Røde oppgaver',group:'Rød gruppe',dueDay:'Torsdag'},
  {subject:'Matte',text:'Blå oppgaver',group:'Blå gruppe',dueDay:'Torsdag'}
 ],
 vocabulary:[
  {category:'Engelske gloser',text:'apple - eple',group:'Rød gruppe'},
  {category:'Engelske gloser',text:'banana - banan',group:'Blå gruppe'},
  {category:'Ukas ord',text:'skole, sol'}
 ],
 notices:[
  'Skolen er stengt fredag på grunn av planleggingsdag.',
  {text:'Rød gruppe: Husk biblioteket',group:'Rød gruppe'},
  {text:'Blå gruppe: Husk gymtøy',group:'Blå gruppe'}
 ],
 days:{
  Onsdag:{events:[{title:'Felles forestilling',time:'10:00'},
    {title:'Biblioteket',group:'Rød gruppe',time:'09:00'},
    {title:'Gym',group:'Blå gruppe',time:'09:00'}],
   bring:[{label:'Bibliotekbok',group:'Rød gruppe'},{label:'Gymbag',group:'Blå gruppe'}]}
 },
 dayNotes:{Onsdag:[
  {text:'Viktig for alle: møte klokken 08:15.'},
  {text:'Rød gruppe møter på biblioteket',group:'Rød gruppe'},
  {text:'Blå gruppe møter i gymsalen',group:'Blå gruppe'}
 ]},attendance:[],
 everyday:[],pdf:'https://www.minskole.no/test.pdf'
};
const texts=items=>items.map(x=>x.text);
test('Matching must be exact, support multi-recipient labels and preserve unspecified groups',()=>{
 assert.deepEqual(targetGroupIds('Rød/Blå gruppe','3'),['color:rød','color:blå']);
 assert.equal(groupMatches('Rød/Blå gruppe','Blå',3),true);
 assert.equal(groupMatches('Rosa og blå gruppe','Rød',3),false);
 assert.equal(groupMatches('Rød gruppe','Blå gruppe',3),false);
 assert.equal(groupMatches('Rødgrønn gruppe','Rød gruppe',3),true,
  'Unknown labels remain visible instead of being guessed');
 assert.equal(groupMatches('5B','A','5'),false);
 assert.equal(groupMatches('5A','A','5'),true);
 assert.equal(groupMatches('A/B','5B','5'),true);
 assert.equal(groupMatches('5B','5A','5'),false);
 assert.equal(groupMatches('3A','A','5'),false);
 assert.equal(groupMatches('Rød gruppe',null,3),true);
 assert.equal(groupMatches(null,'Rød gruppe',3),true);
 assert.equal(groupApplies({group:'Rød gruppe'},unknown),true);
});
test('All child and guardian homework totals exclude unrelated groups but keep original stable indices',()=>{
 const a=profileSummary(red,plan,week),b=profileSummary(blue,plan,week);
 assert.equal(a.total,2);assert.equal(b.total,2);
 assert.deepEqual(texts(a.tasks),['Les 10 minutter','Røde oppgaver']);
 assert.deepEqual(texts(b.tasks),['Les 10 minutter','Blå oppgaver']);
 assert.deepEqual(scopedHomeworkItems(plan,red).map(x=>x.index),[0,1]);
 assert.deepEqual(scopedHomeworkItems(plan,blue).map(x=>x.index),[0,2]);
 assert.equal(scopedPackingItems(plan,red,'Onsdag').some(x=>x.label==='Gymbag'),false);
 assert.equal(scopedPackingItems(plan,blue,'Onsdag').some(x=>x.label==='Gymbag'),true);
});
test('Shared notices remain visible, but child-specific week notices are isolated',()=>{
 const r=profileSummary(red,plan,week),b=profileSummary(blue,plan,week);
 assert.ok(texts(r.weeklyNotices).some(s=>s.includes('stengt')));
 assert.ok(texts(b.weeklyNotices).some(s=>s.includes('stengt')));
 assert.ok(texts(r.weeklyNotices).some(s=>s.includes('biblioteket')));
 assert.ok(!texts(r.weeklyNotices).some(s=>s.includes('Gymtøy')));
 assert.ok(texts(b.weeklyNotices).some(s=>s.includes('Gymtøy')));
 assert.ok(!texts(b.weeklyNotices).some(s=>s.includes('biblioteket')));
 const own=childSchoolDayDetails(plan,red,'Onsdag');
 assert.ok(own.notes.some(x=>x.text.includes('Viktig for alle')));
 assert.ok(own.notes.some(x=>x.text.includes('Rød gruppe')));
 assert.ok(!own.notes.some(x=>x.text.includes('Blå gruppe')));
 assert.ok(own.own.some(x=>x.entries.some(e=>e.title==='Felles forestilling')));
 assert.ok(!own.own.some(x=>x.entries.some(e=>e.title==='Gym')));
 const highlights=practicalHighlights({profiles:[red,blue],summaries:new Map([[red.id,r],[blue.id,b]]),
  plans:new Map([[red.id,plan],[blue.id,plan]]),calendar:week,focus:'week'});
 assert.ok(!highlights.some(x=>x.id===red.id&&x.label.includes('Gymtøy')));
 assert.ok(!highlights.some(x=>x.id===blue.id&&x.label.includes('biblioteket')));
 assert.ok(highlights.some(x=>x.id===red.id&&x.label.includes('stengt')));
});
test('Glossary selection matches the homework group and keeps shared word lists',()=>{
 assert.deepEqual(quizItems(vocabularyForProfile(plan.vocabulary,red)).filter(x=>x.language==='en').map(x=>x.word),['apple']);
 assert.deepEqual(quizItems(vocabularyForProfile(plan.vocabulary,blue)).filter(x=>x.language==='en').map(x=>x.word),['banana']);
 assert.ok(quizItems(vocabularyForProfile(plan.vocabulary,red)).some(x=>x.word==='skole'));
 assert.equal(vocabularyForProfile(plan.vocabulary,unknown).length,3,
  'An unconfigured profile never silently loses published word lists');
});
test('AI accepts a group for glossary ONLY when the exact source quote and PDF prove it',()=>{
 assert.equal(AI_SCHEMA_VERSION,21);
 assert.deepEqual(AI_SCHEMA.properties.vocabulary.items.properties.group.type,['string','null']);
 assert.match(SYSTEM_PROMPT,/vocabulary\.group/);
 const redQuote='Engelske gloser: Rød gruppe apple - eple';
 const blueQuote='Engelske gloser: Blå gruppe banana - banan';
 const make=(group,quote,text)=>({category:'Engelske gloser',group,
  text,sourcePage:1,sourceQuote:quote});
 const raw={days:[],attendance:[],dayNotes:[],homework:[],packing:[],notices:[],
  learningGoals:[],subjects:[],contacts:[],specialContent:[],
  vocabulary:[make('Rød gruppe',redQuote,'apple - eple'),
   make('Blå gruppe',blueQuote,'banana - banan'),
   make('Grønn gruppe','Engelske gloser: dog - hund','dog - hund')],
  weekTheme:{text:null,sourcePage:null,sourceQuote:''},
  optionalMission:{text:null,sourcePage:null,sourceQuote:''},
  coverage:{state:'complete',reason:''}};
 const p=normalizeAIPlan(raw,{school:'fagerholt',grade:'3',year:2026,week:47,
  source:'https://www.minskole.no/fagerholt/seksjon/22636',
  pdf:'https://www.minskole.no/DynamicContent/Documents/uke47.pdf',pageCount:1,
  pageTexts:[redQuote+' '+blueQuote+' Engelske gloser: dog - hund']});
 assert.equal(p.vocabulary.find(x=>x.text==='apple - eple')?.group,'Rød gruppe');
 assert.equal(p.vocabulary.find(x=>x.text==='banana - banan')?.group,'Blå gruppe');
 assert.equal(p.vocabulary.find(x=>x.text==='dog - hund')?.group,undefined);
 assert.ok(!vocabularyForProfile(p.vocabulary,red).some(x=>x.text==='banana - banan'));
});
test('Parent and child interfaces both reuse the same group filtering, not independent guesses',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const guardian=read('public/app.js'),family=read('public/family-ui.mjs'),child=read('public/barn/child.mjs');
 assert.match(guardian,/vocabularyForProfile\(p\?\.vocabulary,selectedProfile\)/);
 assert.match(guardian,/homeworkDisplayGroups\(items\)\.filter/);
 assert.match(guardian,/renderHomeworkProgress\(hw,selectedProfile\)/);
 assert.match(guardian,/const notices=\(p\?\.notices\|\|\[\]\)\.filter/);
 assert.match(guardian,/const attendance=\(p\?\.attendance\|\|\[\]\)\.filter/);
 assert.match(family,/quizItems\(vocabularyForProfile\(plan\.vocabulary,profile\)\)/);
 assert.match(child,/renderChildQuiz\(ok\?vocabularyForProfile/);
 assert.match(child,/\$\('child-other-groups'\)\.hidden=true/);
});
