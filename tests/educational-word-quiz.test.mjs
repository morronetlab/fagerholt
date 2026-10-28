import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {quizItems,quizWords,buildQuizRounds,quizExpected,isQuizAnswerCorrect} from '../public/shared/word-quiz.mjs';
test('English pairs in school PDF take precedence over local translations',()=>{
 const items=quizItems([{category:'Engelske ord',text:'apple - eple\ncar = bil\nsnow → snø'}]);
 assert.deepEqual(items.map(i=>[i.word,i.translation,i.fromPdf]),[['apple','eple',true],['car','bil',true],['snow','snø',true]]);
 assert.deepEqual(buildQuizRounds(items,'en').map(x=>x.kind),['meaning','meaning','meaning','listen','listen','listen']);
});
test('English words without translations use curated meanings, otherwise listening',()=>{
 const items=quizItems([{category:'Engelske ord',text:'apple, banana, unknownword'}]);
 assert.deepEqual(items.map(i=>i.translation),['eple','banan',null]);
 const rounds=buildQuizRounds(items,'en');
 assert.equal(rounds.filter(r=>r.kind==='meaning').length,2);
 assert.equal(rounds.filter(r=>r.kind==='listen').length,3);
 assert.equal(isQuizAnswerCorrect(rounds[0],'APPLE'),true);
 assert.equal(isQuizAnswerCorrect(rounds[0],'banana'),false);
});
test('Norwegian words use memory and vowel practice instead of trivial multiple-choice',()=>{
 const items=quizItems([{category:'Ukas ord',text:'skole\nhytte\nbok'}]);
 assert.deepEqual(quizWords([{category:'Ukas ord',text:'skole\nhytte\nbok'}]),['skole','hytte','bok']);
 const rounds=buildQuizRounds(items,'nb');
 assert.deepEqual(rounds.map(r=>r.kind),['memory','memory','memory','vowels','vowels','vowels']);
 assert.equal(quizExpected(rounds[3]),'oe');
 assert.equal(isQuizAnswerCorrect(rounds[3],'o e'),true);
 assert.equal(isQuizAnswerCorrect(rounds[4],'y, e'),true);
 assert.equal(isQuizAnswerCorrect(rounds[4],'e y'),false);
});
test('Do not present learning goals, themes, or sentences as quiz words',()=>{
 assert.deepEqual(quizItems([{category:'Læringsmål',text:'Jeg kan lese en tekst'},{category:'Tema',text:'Høsten'},{category:'Ukas ord',text:'Vi skal lære å skrive setninger'}]),[]);
});
test('UI has no answer-revealing multiple choice and includes accessible listening and study controls',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/shared/word-quiz.mjs',import.meta.url),'utf8');
 for(const id of ['word-quiz-language','word-quiz-speak','word-quiz-peek','word-quiz-preview','word-quiz-form','word-quiz-feedback'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(!html.includes('word-quiz-options'));
 assert.match(js,/speechSynthesis/);
 assert.match(js,/buildQuizRounds/);
});
