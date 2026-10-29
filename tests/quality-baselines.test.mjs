/** Contract tests for existing behavior before refactoring parsers and UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePdfPages,findPdfLinks,choosePdf} from '../lib/plan-core.mjs';
import {normalizeAIPlan} from '../lib/ai-plan.mjs';
import {quizItems,buildQuizRounds,isQuizAnswerCorrect} from '../public/shared/word-quiz-core.mjs';
import {needsHomeworkHelp} from '../public/shared/homework-help-eligibility.mjs';
import {createSjoestrand2Page,createFagerholt5Page,englishEvidence,sampleEnglishAI} from './fixtures/week44-baselines.mjs';

const source='https://www.minskole.no/fagerholt/seksjon/22636';
const pdf='https://www.minskole.no/DynamicContent/Documents/test-uke-44.pdf';

test('Sjøstrand 2: practical information never appears as pupil homework',()=>{
 const plan=analyzePdfPages([createSjoestrand2Page()],'2',pdf,44,2026,source);
 assert.ok(plan.homework.some(x=>/Fabel lesebok/.test(x.text)));
 assert.ok(plan.homework.some(x=>/ark i leksemappa/.test(x.text)));
 assert.ok(!plan.homework.some(x=>/vaksin|gymsko/i.test(x.text)));
 assert.ok(plan.dayNotes.Onsdag.some(x=>/vaksine/i.test(x.text)));
 assert.ok(plan.days.Fredag.bring.some(x=>x.label==='Gymsko'));
});

test('Fagerholt 5: row-based days and one-day gym gear remain stable',()=>{
 const plan=analyzePdfPages([createFagerholt5Page()],'5',pdf,44,2026,source);
 assert.equal(plan.layout,'day-rows');
 for(const day of ['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'])
  assert.ok(plan.days[day].events.length>0,day);
 assert.ok(plan.homework.some(x=>/Les minst 20 minutter/i.test(x.text)));
 assert.ok(plan.days.Tirsdag.bring.some(x=>x.label==='Gymtøy'));
 assert.ok(!plan.days.Mandag.bring.some(x=>x.label==='Gymtøy'));
});

test('AI vocabulary reaches the English-to-Norwegian quiz without rewriting data',()=>{
 const raw=sampleEnglishAI();
 const plan=normalizeAIPlan(raw,{grade:'5',week:44,year:2026,source,pdf,
  pageCount:1,pageTexts:[englishEvidence+' Beskjed: Husk skoleboka']});
 const entries=quizItems(plan.vocabulary);
 assert.deepEqual(entries.map(x=>[x.word,x.translation]),[['apple','eple'],['banana','banan']]);
 const rounds=buildQuizRounds(entries,'en');
 assert.ok(rounds.some(x=>x.kind==='meaning'));
 assert.equal(isQuizAnswerCorrect(rounds[0],'eple'),true);
 assert.equal(isQuizAnswerCorrect(rounds[0],'apple'),false);
});

test('Pure reading requests are not offered AI help, but answer-writing tasks are',()=>{
 assert.equal(needsHomeworkHelp({text:'Les minst 10 min. i heftet ditt/ boka di!'}),false);
 assert.equal(needsHomeworkHelp({text:'Ta med gymsko'}),false);
 assert.equal(needsHomeworkHelp({text:'Les teksten og svar på spørsmålene'}),true);
});

test('PDF selection never substitutes a document from the previous week',()=>{
 const current='https://www.minskole.no/DynamicContent/Documents/uke44.pdf';
 const old='https://www.minskole.no/DynamicContent/Documents/uke43.pdf';
 const html='<a href="'+old+'">Ukeplan uke 43</a><a href="'+current+'">Ukeplan uke 44</a>';
 const links=findPdfLinks(html,source);
 assert.equal(choosePdf(links,44)?.url,current);
 assert.equal(choosePdf(links,45),null);
});
