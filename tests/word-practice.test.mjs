import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {quizItems,buildQuizRounds} from '../public/shared/word-quiz-core.mjs';
import {practiceRoundId,practiceKey,newPractice,restorePractice,practiceAnswer,practiceNext,practiceSummary} from '../public/shared/word-practice-core.mjs';
const vocabulary=quizItems([{category:'Engelske gloser',text:'apple - eple\nbanana - banan\npear - pære'}]);
const rounds=buildQuizRounds(vocabulary,'en');
const nextOk=s=>practiceNext(practiceAnswer(s,true));
test('Local practice keys isolate school, grade, week, language and source list',()=>{
 const context={school:'sjostrand',grade:'5A',week:44,year:2026},a=practiceKey(context,'en',vocabulary);
 assert.notEqual(a,practiceKey({...context,grade:'2'},'en',vocabulary));
 assert.notEqual(a,practiceKey({...context,school:'fagerholt'},'en',vocabulary));
 assert.notEqual(a,practiceKey({...context,week:45},'en',vocabulary));
 assert.notEqual(a,practiceKey({...context,year:2027},'en',vocabulary));
 assert.notEqual(a,practiceKey(context,'nb',vocabulary));
 assert.notEqual(a,practiceKey(context,'en',quizItems([{category:'Engelske ord',text:'apple - frukt'}])));
});
test('Wrong answer becomes a repetition after the initial sequence',()=>{
 let s=practiceNext(practiceAnswer(newPractice(rounds),false));
 for(let i=1;i<rounds.length;i++)s=nextOk(s);
 assert.equal(s.phase,'question');
 assert.equal(s.queue.length,rounds.length+1);
 assert.equal(s.queue.at(-1),practiceRoundId(rounds[0]));
 s=nextOk(s);
 assert.equal(s.phase,'done');
 assert.equal(s.weak.length,0);
 assert.equal(practiceSummary(s,rounds).percentage,100);
});
test('Answered question is persisted and cannot be submitted twice',()=>{
 let s=practiceAnswer(newPractice(rounds),true);
 assert.equal(practiceAnswer(s,false),s);
 const restored=restorePractice(JSON.stringify(s),rounds);
 assert.equal(restored.phase,'answered');assert.equal(restored.index,0);
 assert.equal(practiceSummary(restored,rounds).correct,1);
 assert.equal(practiceNext(restored).index,1);
});
test('Review only includes difficult exercises and allows another pass',()=>{
 let s=practiceNext(practiceAnswer(newPractice(rounds),false));
 for(let i=1;i<rounds.length;i++)s=nextOk(s);
 s=practiceNext(practiceAnswer(s,false));
 assert.equal(s.phase,'done');
 assert.equal(s.weak.length,1);
 let retry=newPractice(rounds,s.weak,'review');
 assert.equal(retry.queue.length,1);
 retry=nextOk(retry);
 assert.equal(retry.phase,'done');assert.deepEqual(retry.weak,[]);
});
test('Corrupt or no-longer-source-matched progress is discarded',()=>{
 const s=newPractice(rounds);
 assert.equal(restorePractice('invalid json',rounds),null);
 assert.equal(restorePractice(JSON.stringify({...s,index:900}),rounds),null);
 assert.equal(restorePractice(JSON.stringify({...s,queue:['fake']}),rounds),null);
 assert.equal(restorePractice(JSON.stringify({...s,phase:'answered'}),rounds),null);
 assert.equal(restorePractice(JSON.stringify(s),rounds.slice(1)),null);
});
test('Overview, pause, source-based quiz and logo remain available',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/shared/word-quiz.mjs',import.meta.url),'utf8');
 for(const id of ['word-quiz-start','word-quiz-review','word-quiz-pause','word-quiz-track','word-quiz-stat-weak'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/brand-symbol/);
 assert.match(html,/Fremdrift lagres kun på denne enheten/);
 assert.match(js,/buildQuizRounds/);
 assert.match(js,/localStorage.setItem/);
});
