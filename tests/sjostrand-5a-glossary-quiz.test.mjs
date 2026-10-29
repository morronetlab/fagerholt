import test from 'node:test';
import assert from 'node:assert/strict';
import {extractEnglishGlossaries} from '../lib/english-glossaries.mjs';
import {normalizeAIPlan,AI_SCHEMA_VERSION} from '../lib/ai-plan.mjs';
import {analyzePdfPages} from '../lib/plan-core.mjs';
import {quizItems,buildQuizRounds,isQuizAnswerCorrect} from '../public/shared/word-quiz-core.mjs';

const token=(text,x,y)=>({text,x,y,width:text.length*5});
const real5aPage=()=>({width:700,height:850,items:[
 token('ENGELSKE GLOSER:',305,205),token('ENGLISH',345,229),token('NORWEGIAN',442,229),
 token('subject',326,253),token('fag',432,253),
 token('lesson',326,281),token('time',432,281),
 token('boarding school',326,309),token('kostskole /',432,309),token('internatskole',432,322),
 token('study hall',326,347),token('lesesal',432,347),
 token('dining hall',326,375),token('spisesal',432,375),
 token('Ukas mål',525,180),token('Engelsk: Jeg kan snakke om skolen',525,245),
 token('Lekser til tirsdag',310,430),token('English: Practice your glossary',310,455)
]});
const expected=[
 ['subject','fag'],['lesson','time'],
 ['boarding school','kostskole / internatskole'],
 ['study hall','lesesal'],['dining hall','spisesal']
];
const meta={grade:'5A',week:44,year:2026,
 source:'https://www.minskole.no/sjostrand/seksjon/22175',
 pdf:'https://www.minskole.no/DynamicContent//Documents/866-Sjostrand-Ukebrev-uke-44-(3)-1082166a-078b.pdf',
 pageCount:1,pageLayouts:[real5aPage()],pageTexts:[real5aPage().items.map(i=>i.text).join(' ')]};
const empty={
 days:[],attendance:[],dayNotes:[],homework:[],packing:[],notices:[],
 learningGoals:[],subjects:[],contacts:[],specialContent:[],vocabulary:[],
 weekTheme:{text:null,sourcePage:null,sourceQuote:''},
 optionalMission:{text:null,sourcePage:null,sourceQuote:''},
 coverage:{state:'complete',reason:'PDF includes a word list'}
};

test('Sjøstrand 5A week 44 recovers all English/Norwegian column pairs',()=>{
 const extracted=extractEnglishGlossaries([real5aPage()]);
 assert.equal(extracted.length,1);
 const items=quizItems(extracted);
 assert.deepEqual(items.map(i=>[i.word,i.translation]),expected);
 const rounds=buildQuizRounds(items,'en');
 assert.equal(rounds.filter(r=>r.kind==='meaning').length,5);
 assert.equal(rounds.filter(r=>r.kind==='recognize').length,5);
 assert.equal(isQuizAnswerCorrect(rounds[2],'kostskole'),true);
 assert.equal(isQuizAnswerCorrect(rounds[2],'internatskole'),true);
 assert.equal(isQuizAnswerCorrect(rounds[2],'boarding school'),false);
});

test('AI output missing vocabulary still gets PDF-grounded Sjøstrand 5A quiz',()=>{
 const normalized=normalizeAIPlan(empty,meta);
 assert.equal(AI_SCHEMA_VERSION,16);
 assert.equal(normalized.vocabulary.length,1);
 assert.deepEqual(quizItems(normalized.vocabulary).map(i=>i.word),
  expected.map(([english])=>english));
});

test('Rules fallback also exposes glossary when AI cannot run',()=>{
 const p=analyzePdfPages([real5aPage()],'5A',meta.pdf,44,2026,meta.source);
 assert.equal(p.vocabulary.length,1);
 assert.deepEqual(quizItems(p.vocabulary).map(i=>i.word),
  expected.map(([english])=>english));
});

test('A source quote from a glossary table row is permitted only when PDF has word-list heading',()=>{
 const pair={category:'Engelske gloser',text:'subject - fag',sourcePage:1,sourceQuote:'subject fag'};
 const withHeading=normalizeAIPlan({...empty,vocabulary:[pair]},
  {...meta,pageLayouts:[]});
 assert.deepEqual(withHeading.vocabulary,[{category:'Engelske gloser',text:'subject - fag'}]);
 const withoutHeading=normalizeAIPlan({...empty,notices:[{day:null,text:'Beskjed til hjemmet',sourcePage:1,sourceQuote:'Beskjed til hjemmet'}],vocabulary:[pair]},
  {...meta,pageLayouts:[],pageTexts:['subject fag Beskjed til hjemmet']});
 assert.deepEqual(withoutHeading.vocabulary,[]);
});

test('Only genuine bilingual vocabulary tables trigger source-based recovery',()=>{
 const p={width:700,height:800,items:[
  token('Engelsk',300,100),token('Jeg kan bruke engelske ord',300,130),
  token('subject',325,200),token('fag',430,200),
  token('Læringsmål',300,250)
 ]};
 assert.deepEqual(extractEnglishGlossaries([p]),[]);
});
