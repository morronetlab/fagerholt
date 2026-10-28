/** Interactive word practice: comprehension first for English, active spelling for Norwegian. */
import {quizItems,quizWords,buildQuizRounds,quizExpected,isQuizAnswerCorrect} from './word-quiz-core.mjs';
export {quizItems,quizWords,buildQuizRounds,quizExpected,isQuizAnswerCorrect} from './word-quiz-core.mjs';
const $=id=>document.getElementById(id);
let items=[],language='en',rounds=[],index=0,score=0,answered=false,peekTimer=null,loadedKey='';
const canSpeak=()=>typeof window!=='undefined'&&'speechSynthesis' in window&&typeof SpeechSynthesisUtterance==='function';
function stopSound(){
 if(peekTimer){clearTimeout(peekTimer);peekTimer=null;}
 $('word-quiz-preview').hidden=true;
 if(canSpeak())window.speechSynthesis.cancel();
}
function availableLanguage(lang){return items.some(x=>x.language===lang);}
function chooseLanguage(lang){
 if(!availableLanguage(lang))return;
 stopSound();language=lang;rounds=[];index=0;score=0;
 $('word-quiz-play').hidden=true;
 $('vocabulary-list').hidden=false;
 $('word-quiz-start').textContent=lang==='en'?'Start engelskøving':'Start norskøving';
 $('word-quiz-description').textContent=lang==='en'
  ?'Øv på betydningen av engelske ord og på å høre og stave dem. Ingen fasit vises før du svarer.'
  :'Øv på rettskriving: se og husk ordene, lytt til dem og finn vokalene.';
 for(const button of document.querySelectorAll('[data-quiz-language]')){
  const selected=button.dataset.quizLanguage===lang;
  button.setAttribute('aria-pressed',String(selected));
 }
}
export function renderWordQuiz(vocabulary,context){
 const key=[context?.school,context?.grade,context?.year,context?.week,JSON.stringify(vocabulary||[])].join(':');
 if(loadedKey===key)return;
 loadedKey=key;stopSound();
 items=quizItems(vocabulary);
 $('vocabulary-list').hidden=false;
 const panel=$('word-quiz');
 panel.hidden=items.length===0;
 if(!items.length)return;
 const hasEnglish=availableLanguage('en'),hasNorwegian=availableLanguage('nb');
 $('word-quiz-language').hidden=!(hasEnglish&&hasNorwegian);
 for(const button of document.querySelectorAll('[data-quiz-language]')){
  button.hidden=!availableLanguage(button.dataset.quizLanguage);
 }
 chooseLanguage(hasEnglish?'en':'nb');
}
function speak(){
 if(!canSpeak())return;
 const round=rounds[index];if(!round)return;
 try{
  const utterance=new SpeechSynthesisUtterance(round.word);
  utterance.lang=round.language==='en'?'en-GB':'nb-NO';
  utterance.rate=.85;
  const voices=window.speechSynthesis.getVoices();
  const preferred=voices.find(v=>v.lang.toLowerCase().startsWith(round.language==='en'?'en':'nb'));
  if(preferred)utterance.voice=preferred;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  $('word-quiz-answer').disabled=false;
 }catch{
  $('word-quiz-feedback').textContent='Lyden er ikke tilgjengelig her. Bruk «Se ordet kort» i stedet.';
 }
}
function peek(){
 const round=rounds[index];if(!round)return;
 if(peekTimer)clearTimeout(peekTimer);
 const preview=$('word-quiz-preview');
 preview.textContent=round.word;
 preview.hidden=false;
 $('word-quiz-answer').disabled=true;
 $('word-quiz-peek').disabled=true;
 peekTimer=setTimeout(()=>{
  peekTimer=null;preview.hidden=true;
  $('word-quiz-peek').disabled=false;
  $('word-quiz-answer').disabled=false;
  $('word-quiz-answer').focus();
 },4000);
}
function showQuestion(){
 stopSound();
 const round=rounds[index];
 if(!round)return;
 answered=false;
 $('word-quiz-play').hidden=false;
 $('word-quiz-progress').textContent='Oppgave '+(index+1)+' av '+rounds.length+' · ⭐ '+score+' riktige';
 $('word-quiz-feedback').textContent='';
 $('word-quiz-next').hidden=true;
 $('word-quiz-start').textContent='Start på nytt';
 $('word-quiz-form').hidden=false;
 $('word-quiz-answer').value='';
 $('word-quiz-answer').disabled=false;
 $('word-quiz-form').querySelector('[type=submit]').disabled=false;
 const kind=$('word-quiz-kind'),question=$('word-quiz-question'),tools=$('word-quiz-tools');
 $('word-quiz-peek').disabled=false;
 tools.hidden=false;
 $('word-quiz-speak').hidden=!canSpeak();
 $('word-quiz-peek').hidden=false;
 $('word-quiz-answer').placeholder=round.language==='en'?'Skriv på engelsk':'Skriv svaret';
 if(round.kind==='meaning'){
  kind.textContent='🇬🇧 Hva betyr ordet?';
  question.textContent='Hva heter «'+round.translation+'» på engelsk?';
  $('word-quiz-answer').placeholder='Skriv det engelske ordet';
  $('word-quiz-peek').hidden=true;
  $('word-quiz-speak').hidden=true; // The spoken English word would reveal the translation answer.
 }else if(round.kind==='listen'){
  kind.textContent='🔊 Lytt og stav';
  question.textContent='Hør det engelske ordet og skriv det slik det staves.';
 }else if(round.kind==='memory'){
  kind.textContent='🧠 Se, husk og skriv';
  question.textContent='Se ordet i fire sekunder. Skjul det og prøv å skrive ordet riktig.';
 }else{
  kind.textContent='🔎 Vokaldetektiv';
  question.textContent='Hvilke vokaler finner du i «'+round.word+'»? Skriv dem i riktig rekkefølge.';
  $('word-quiz-speak').hidden=true;
  $('word-quiz-peek').hidden=true;
  $('word-quiz-answer').placeholder='For eksempel: ae';
 }
 // Don't require an external speech service: the visual memory route works offline.
 if((round.kind==='listen'||round.kind==='memory')&&!canSpeak()){
  $('word-quiz-answer').disabled=true;
  $('word-quiz-feedback').textContent='Trykk «Se ordet kort» først, og skriv når ordet er skjult.';
 }
 $('word-quiz-answer').focus();
}
function submit(){
 if(answered||index>=rounds.length)return;
 const round=rounds[index],input=$('word-quiz-answer');
 if(!input.value.trim())return;
 answered=true;
 stopSound();
 const correct=isQuizAnswerCorrect(round,input.value);
 if(correct)score++;
 const expected=quizExpected(round);
 $('word-quiz-feedback').textContent=correct?'🎉 Riktig! Bra jobbet.':
  (round.kind==='vowels'?'Vokalene er «'+expected+'».':'Riktig ord er «'+expected+'».')+' Prøv å huske det neste gang.';
 input.disabled=true;
 $('word-quiz-form').querySelector('[type=submit]').disabled=true;
 $('word-quiz-tools').hidden=true;
 $('word-quiz-next').hidden=false;
}
function finish(){
 stopSound();
 $('word-quiz-progress').textContent='🏆 '+score+' av '+rounds.length+' riktige';
 $('word-quiz-kind').textContent='Ferdig!';
 $('word-quiz-question').textContent='Bra jobbet med ordene! Du kan prøve igjen når du vil.';
 $('word-quiz-feedback').textContent='Du øvde på '+new Set(rounds.map(r=>r.word)).size+' ord.';
 $('word-quiz-form').hidden=true;
 $('word-quiz-tools').hidden=true;
 $('word-quiz-next').hidden=true;
 $('vocabulary-list').hidden=false;
}
export function initWordQuiz(){
 $('word-quiz-start').addEventListener('click',()=>{
  rounds=buildQuizRounds(items,language);
  index=0;score=0;
  if(rounds.length){$('vocabulary-list').hidden=true;showQuestion();}
 });
 $('word-quiz-next').addEventListener('click',()=>{
  if(!answered)return;
  index++;
  if(index>=rounds.length)finish();else showQuestion();
 });
 $('word-quiz-form').addEventListener('submit',event=>{event.preventDefault();submit();});
 $('word-quiz-peek').addEventListener('click',peek);
 $('word-quiz-speak').addEventListener('click',speak);
 document.querySelectorAll('[data-quiz-language]').forEach(button=>{
  button.addEventListener('click',()=>chooseLanguage(button.dataset.quizLanguage));
 });
}
