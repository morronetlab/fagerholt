import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {quizItems,quizWords,buildQuizRounds,quizExpected,isQuizAnswerCorrect} from '../public/shared/word-quiz.mjs';
test('English pairs in school PDF take precedence over local translations',()=>{
 const items=quizItems([{category:'Engelske ord',text:'apple - eple\ncar = bil\nsnow → snø'}]);
 assert.deepEqual(items.map(i=>[i.word,i.translation,i.fromPdf]),[['apple','eple',true],['car','bil',true],['snow','snø',true]]);
 assert.deepEqual(buildQuizRounds(items,'en').map(x=>x.kind),['meaning','meaning','meaning','recognize','recognize','recognize']);
});
test('English words without translations use curated meanings, otherwise listening',()=>{
 const items=quizItems([{category:'Engelske ord',text:'apple, banana, unknownword'}]);
 assert.deepEqual(items.map(i=>i.translation),['eple','banan',null]);
 const rounds=buildQuizRounds(items,'en');
 assert.equal(rounds.filter(r=>r.kind==='meaning').length,2);
 assert.equal(rounds.filter(r=>r.kind==='listen').length,1);
 assert.equal(quizExpected(rounds[0]),'eple');
 assert.equal(isQuizAnswerCorrect(rounds[0],'EPLE'),true);
 assert.equal(isQuizAnswerCorrect(rounds[0],'banan'),false);
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
test('UI supports English-to-Norwegian input and a grounded Norwegian meaning choice',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/shared/word-quiz.mjs',import.meta.url),'utf8');
 for(const id of ['word-quiz-language','word-quiz-speak','word-quiz-peek','word-quiz-preview','word-quiz-form','word-quiz-feedback'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(html.includes('id="word-quiz-options"'));
 assert.match(js,/Hva betyr «.*» på norsk/);
 assert.match(js,/Finn riktig betydning/);
 assert.match(js,/speechSynthesis/);
 assert.match(js,/buildQuizRounds/);
});

test('English word is the question and Norwegian translation is the expected answer',()=>{
 const items=quizItems([{category:'Engelske ord',text:'apple - eple\nbanana - banan\nsnow - snø'}]);
 const rounds=buildQuizRounds(items,'en');
 for(const round of rounds){
  assert.ok(['meaning','recognize'].includes(round.kind));
  assert.equal(isQuizAnswerCorrect(round,round.translation),true);
  assert.equal(isQuizAnswerCorrect(round,round.word),false);
 }
});
test('Norwegian meaning choices are exclusively source-supported and never repeat answers',()=>{
 const items=quizItems([{category:'Engelske ord',text:'apple = eple\nbanana = banan\nsnow = snø\nbird = fugl'}]);
 const rounds=buildQuizRounds(items,'en').filter(r=>r.kind==='recognize');
 assert.equal(rounds.length,4);
 for(const round of rounds){
  assert.equal(new Set(round.choices).size,round.choices.length);
  assert.ok(round.choices.includes(round.translation));
  assert.ok(round.choices.length>=3&&round.choices.length<=4);
  assert.ok(round.choices.every(choice=>items.some(i=>i.translation===choice)));
  assert.equal(isQuizAnswerCorrect(round,round.translation),true);
  assert.equal(isQuizAnswerCorrect(round,round.choices.find(v=>v!==round.translation)),false);
 }
});
test('English-only words without trustworthy translation do not invent a meaning round',()=>{
 const items=quizItems([{category:'Engelske ord',text:'obscureword, dog'}]);
 assert.deepEqual(buildQuizRounds(items,'en').map(r=>r.kind),['meaning','listen']);
});
