import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeVocabularyText} from '../lib/vocabulary-text.mjs';
import {normalizeAIPlan,AI_SCHEMA_VERSION} from '../lib/ai-plan.mjs';
import {quizItems,buildQuizRounds,isQuizAnswerCorrect} from '../public/shared/word-quiz-core.mjs';
import {extractEnglishGlossaries} from '../lib/english-glossaries.mjs';
import {classifyHomeworkText} from '../lib/homework-routing.mjs';
import {
 sjoestrand5AGlossaryText,sjoestrand5AGlossaryExpected,
 sjoestrand5AGlossarySource,sjoestrand2Homework,sjoestrand2NorwegianWords
} from './fixtures/verified-week44-school-data.mjs';

const quote={sourcePage:1,sourceQuote:sjoestrand5AGlossarySource};
const meta={grade:'5A',week:44,year:2026,
 source:'https://www.minskole.no/sjostrand/seksjon/22175',
 pdf:'https://www.minskole.no/DynamicContent/Documents/sjostrand-uke44.pdf',
 pageCount:1,pageTexts:[sjoestrand5AGlossarySource]};
const empty=()=>({
 days:[],attendance:[],dayNotes:[],homework:[],packing:[],
 notices:[],learningGoals:[],subjects:[],contacts:[],specialContent:[],
 vocabulary:[],weekTheme:{text:null,sourcePage:null,sourceQuote:''},
 optionalMission:{text:null,sourcePage:null,sourceQuote:''},
 coverage:{state:'complete',reason:'glossary included'}
});

test('Sjøstrand 5A: preserve five PDF-backed English entries from AI through to Norwegian quiz',()=>{
 const raw={...empty(),vocabulary:[{category:'Engelske gloser',text:sjoestrand5AGlossaryText,...quote}]};
 const plan=normalizeAIPlan(raw,meta);
 assert.equal(AI_SCHEMA_VERSION,18);
 assert.equal(plan.vocabulary.length,1);
 assert.match(plan.vocabulary[0].text,/subject - fag\nlesson - time/);
 const actual=quizItems(plan.vocabulary);
 assert.deepEqual(actual.map(v=>[v.word,v.translation]),sjoestrand5AGlossaryExpected);
 const rounds=buildQuizRounds(actual,'en');
 assert.equal(rounds.filter(x=>x.kind==='meaning').length,5);
 assert.equal(rounds.filter(x=>x.kind==='recognize').length,5);
 assert.ok(isQuizAnswerCorrect(rounds[2],'internatskole'));
 assert.ok(isQuizAnswerCorrect(rounds[2],'kostskole'));
 assert.ok(!isQuizAnswerCorrect(rounds[2],'boarding school'));
});

test('Windows and old Mac PDF line breaks still become distinct glossary questions',()=>{
 const lines='apple - eple\r\nbanana - banan\rpear - pære';
 const raw={...empty(),vocabulary:[{category:'Engelske ord',text:lines,...quote}]};
 const plan=normalizeAIPlan(raw,meta);
 assert.deepEqual(quizItems(plan.vocabulary).map(x=>[x.word,x.translation]),
 [['apple','eple'],['banana','banan'],['pear','pære']]);
});

test('Comma-separated English glossary still behaves exactly as before',()=>{
 const raw={...empty(),vocabulary:[{category:'Engelske ord',text:'apple - eple, banana - banan',...quote}]};
 const plan=normalizeAIPlan(raw,meta);
 assert.deepEqual(quizItems(plan.vocabulary).map(x=>x.word),['apple','banana']);
});

test('Norwegian exercise words remain separate; no English rounds are invented',()=>{
 const normalized=normalizeVocabularyText(sjoestrand2NorwegianWords.join('\n'));
 const items=quizItems([{category:'Øveord',text:normalized}]);
 assert.deepEqual(items.map(x=>x.word),sjoestrand2NorwegianWords);
 assert.equal(buildQuizRounds(items,'en').length,0);
 assert.equal(buildQuizRounds(items,'nb').length,8);
});

test('Sjøstrand 2: reading remains homework; vaccination and shoes remain practical',()=>{
 const kinds=sjoestrand2Homework.map(text=>classifyHomeworkText(text).kind);
 assert.deepEqual(kinds,['homework','homework','homework','vaccine','packing']);
});

test('A general English learning goal does not become an invented quiz',()=>{
 const raw={...empty(),notices:[{day:null,text:'Ukas mål i engelsk',...quote}],
  vocabulary:[{category:'Læringsmål',text:'I can talk about my school',...quote}]};
 const normalized=normalizeAIPlan(raw,meta);
 assert.deepEqual(normalized.vocabulary,[]);
 assert.equal(quizItems(normalized.vocabulary).length,0);
});

test('No glossary metadata means a normal school timetable cannot generate fake English pairs',()=>{
 const page={width:700,height:800,items:[
  {text:'Engelsk',x:300,y:100},
  {text:'subject',x:325,y:200},{text:'fag',x:430,y:200},
  {text:'Læringsmål',x:300,y:260}
 ]};
 assert.deepEqual(extractEnglishGlossaries([page]),[]);
});

test('Preserved newlines never exceed the same 600-character source limit',()=>{
 const long=Array(100).fill('apple - eple').join('\n');
 const value=normalizeVocabularyText(long,600);
 assert.ok(value.length<=600);
 assert.ok(value.includes('\n'));
});
