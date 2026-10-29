import test from 'node:test';
import assert from 'node:assert/strict';
import {extractNorwegianWordLists} from '../lib/norwegian-word-lists.mjs';
import {normalizeAIPlan,AI_SCHEMA_VERSION} from '../lib/ai-plan.mjs';
import {analyzePdfPages} from '../lib/plan-core.mjs';
import {quizItems,buildQuizRounds} from '../public/shared/word-quiz-core.mjs';

// De-identified, source-shaped PDF.js coordinates verified visually against:
// https://www.minskole.no/DynamicContent//Documents/866-Sjostrand-Ukebrev-uke-44-ca300aa3-539e.pdf
// The words occupy the middle column beside "Ukas mål", not the homework table.
const token=(text,x,y)=>({text,x,y,width:Math.max(30,text.length*5)});
const page=()=>({width:900,height:640,items:[
 token('UKEBREV FOR 2. TRINN',35,45),
 token('Hei!',35,84),
 token('Ukas øveord:',482,91),
 token('Ukas mål:',680,91),
 token('skjorte',487,125),
 token('skjegg',487,143),
 token('skjell',487,161),
 token('skjære',487,179),
 token('Jeg kan lese/skrive ukas øveord.',680,130),
 token('Jeg holder orden i garderoben.',680,161),
 token('Jeg vet hva egenberedskap betyr.',680,197),
 token('Denne uka skal vi introdusere skj-lyden for elevene.',35,121),
 token('Lekser til tirsdag',38,413),
 token('Lekser til onsdag',266,413),
 token('Lekser til torsdag',491,413),
 token('Lekser til fredag',715,413),
 token('Norsk: Les s. 58-59 i Fabel lesebok.',38,455),
 token('Vaksine onsdag morgen.',266,455),
 token('Ta med gymsko.',715,455)
]});
const expected=['skjorte','skjegg','skjell','skjære'];
const metadata={grade:'2',week:44,year:2026,source:'https://www.minskole.no/sjostrand/seksjon/22169',
 pdf:'https://www.minskole.no/DynamicContent//Documents/866-Sjostrand-Ukebrev-uke-44-ca300aa3-539e.pdf',
 pageLayouts:[page()],pageCount:1,
 pageTexts:[page().items.map(x=>x.text).join(' ')]};
const empty=()=>({
 days:[],attendance:[],dayNotes:[],homework:[],packing:[],notices:[],subjects:[],
 learningGoals:[],contacts:[],specialContent:[],vocabulary:[],
 weekTheme:{text:null,sourcePage:null,sourceQuote:''},
 optionalMission:{text:null,sourcePage:null,sourceQuote:''},
 coverage:{state:'complete',reason:'PDF has a weekly word list'}
});

test('Sjøstrand 2: read four words from actual Norwegian word-list column, not nearby goals',()=>{
 const recovered=extractNorwegianWordLists([page()]);
 assert.deepEqual(recovered,[{category:'Ukas øveord',text:expected.join('\n')}]);
 const items=quizItems(recovered);
 assert.deepEqual(items.map(x=>x.word),expected);
 assert.ok(items.every(x=>x.language==='nb'));
 assert.deepEqual(buildQuizRounds(items,'nb').map(x=>x.kind),[
  'memory','memory','memory','memory','vowels','vowels','vowels','vowels']);
});

test('AI omitting source word list still produces a trustworthy Norwegian quiz',()=>{
 const plan=normalizeAIPlan(empty(),metadata);
 assert.equal(AI_SCHEMA_VERSION,19);
 assert.deepEqual(quizItems(plan.vocabulary).map(x=>x.word),expected);
});

test('Rule-based fallback also recovers Norwegian exercise words',()=>{
 const plan=analyzePdfPages([page()],'2',metadata.pdf,44,2026,metadata.source);
 assert.deepEqual(quizItems(plan.vocabulary).map(x=>x.word),expected);
});

test('Model-written Ukas øveord is accepted only with source evidence',()=>{
 const quote='Ukas øveord: skjorte skjegg skjell skjære';
 const model={...empty(),vocabulary:[{category:'Ukas øveord',text:expected.join('\n'),
  sourcePage:1,sourceQuote:quote}]};
 const p=normalizeAIPlan(model,{...metadata,pageLayouts:[]});
 assert.deepEqual(quizItems(p.vocabulary).map(x=>x.word),expected);
 const wrong={...empty(),vocabulary:[{category:'Ukas øveord',text:'høst, jul',
  sourcePage:1,sourceQuote:'Ukas mål: Jeg vet hva egenberedskap betyr'}]};
 const rejected=normalizeAIPlan(wrong,metadata);
 assert.deepEqual(quizItems(rejected.vocabulary).map(x=>x.word),expected);
});

test('No words invented from learning goals or isolated mention without explicit heading',()=>{
 const p=page();
 p.items=p.items.filter(x=>!/^Ukas øveord:$/i.test(x.text));
 assert.deepEqual(extractNorwegianWordLists([p]),[]);
 const goals={width:900,height:640,items:[
  token('Ukas mål:',680,91),token('Jeg kan lese/skrive ukas øveord.',680,130),
  token('Jeg holder orden i garderoben.',680,160)]};
 assert.deepEqual(extractNorwegianWordLists([goals]),[]);
});

test('English words remain preferred whenever both source languages exist',()=>{
 const norwegian=extractNorwegianWordLists([page()]);
 const both=[...norwegian,{category:'Engelske gloser',text:'apple - eple\nbanana - banan'}];
 const items=quizItems(both);
 const english=buildQuizRounds(items,'en');
 assert.ok(english.some(r=>r.kind==='meaning'&&r.word==='apple'&&r.translation==='eple'));
 assert.equal(items.filter(x=>x.language==='nb').length,4);
});

test('Exact fragmented text structure observed in original PDF.js source is recovered',()=>{
 const p=page();
 p.items=p.items.filter(x=>x.text!=='Ukas øveord:'&&x.text!=='skjegg');
 p.items.push(
  {text:'Ukas',x:453,y:91,width:31},
  {text:'øve',x:489,y:91,width:22},
  {text:'ord:',x:513,y:91,width:24},
  {text:'s',x:453,y:138,width:8},
  {text:'kjegg',x:461,y:138,width:31}
 );
 assert.deepEqual(quizItems(extractNorwegianWordLists([p])).map(x=>x.word),expected);
});

test('Split heading across adjacent PDF tokens is recognized',()=>{
 const p=page();p.items=p.items.filter(x=>x.text!=='Ukas øveord:');
 p.items.push(token('Ukas',482,91),token('øveord:',528,91));
 assert.deepEqual(quizItems(extractNorwegianWordLists([p])).map(x=>x.word),expected);
});

test('Nygård 5 week 44: Norwegian words are separated from English and themes',()=>{
 // Representative PDF.js coordinates verified against the school PDF page 2:
 // https://minskole.no/DynamicContent//Documents/882-nygaard-Uke-44-96453e1f-6cf1.pdf
 const words=['overskrift','lykkelig','trist','illustrasjon','respons','avsnitt','problem'];
 const p={width:1024,height:1450,items:[
  token('UKAS TEMA',95,910),token('NORSKE ØVEORD',390,910),token('ENGELSKE GLOSER',706,910),
  token('NORSK: Vi jobber med fortelling.',95,962),
  ...words.map((text,i)=>token(text,480,956+i*51)),
  token('team',711,962),token('lag',836,962),
  token('midfielder',711,1013),token('midtbanespiller',836,1013)
 ]};
 const norwegian=extractNorwegianWordLists([p]);
 assert.deepEqual(norwegian,[{category:'Norske øveord',text:words.join('\n')}]);
 const items=quizItems([...norwegian,{category:'Engelske gloser',text:'team - lag\nmidfielder - midtbanespiller'}]);
 assert.deepEqual(items.filter(x=>x.language==='nb').map(x=>x.word),words);
 assert.deepEqual(items.filter(x=>x.language==='en').map(x=>x.word),['team','midfielder']);
 const plan=normalizeAIPlan(empty(),{...metadata,grade:'5',pageLayouts:[p],pageTexts:[p.items.map(x=>x.text).join(' ')]});
 assert.deepEqual(quizItems(plan.vocabulary).filter(x=>x.language==='nb').map(x=>x.word),words);
});
test('Nygård word-list headings must be explicit, not adjacent learning goals',()=>{
 const p={width:1024,height:1450,items:[token('UKAS TEMA',95,910),token('Jeg kan snakke om fotball.',95,962),
  token('ENGELSKE GLOSER',706,910),token('team',711,962),token('lag',836,962)]};
 assert.deepEqual(extractNorwegianWordLists([p]),[]);
 assert.deepEqual(quizItems([{category:'Norske gloser',text:'overskrift\nlykkelig'}]).map(x=>x.language),['nb','nb']);
});
