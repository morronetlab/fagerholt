/** Interactive word practice: comprehension first for English, active spelling for Norwegian. */
import {quizItems,quizWords,buildQuizRounds,quizExpected,isQuizAnswerCorrect} from './word-quiz-core.mjs';
export {quizItems,quizWords,buildQuizRounds,quizExpected,isQuizAnswerCorrect} from './word-quiz-core.mjs';
import {practiceRoundId,practiceKey,newPractice,restorePractice,practiceAnswer,practiceNext,practiceSummary} from './word-practice-core.mjs';
function createQuizController(fixedLanguage,suffix){
const $=id=>document.getElementById(id+suffix);
let items=[],language='en',rounds=[],index=0,score=0,answered=false,peekTimer=null,loadedKey='',scope={},session=null,storeKey='',allRounds=[]; 
function persist(){try{if(session&&storeKey)localStorage.setItem(storeKey,JSON.stringify(session));}catch{/* private browsing: transient only */}}
function saved(){try{return restorePractice(localStorage.getItem(storeKey),allRounds);}catch{return null;}}
function applySession(s){session=s;rounds=s?s.queue.map(id=>allRounds.find(r=>practiceRoundId(r)===id)):[];index=s?.index||0;answered=s?.phase==='answered';score=s?.answers.filter(a=>a.ok).length||0;}
function summary(){const p=practiceSummary(session,allRounds);
 $('word-quiz-stat-correct').textContent=p.correct;$('word-quiz-stat-progress').textContent=p.done+' / '+(session?.queue.length||p.total);
 $('word-quiz-stat-weak').textContent=p.weak;
 const button=$('word-quiz-start');
 button.textContent=session&&session.phase!=='done'?'Fortsett øvingen':session?'Start ny øving':'Start øvingen';
 $('word-quiz-welcome').textContent=session&&session.phase!=='done'?'Du har en økt å fortsette med!':session?.phase==='done'?'Flott jobbet! Klar igjen?':'Klar for ordutfordringen?';
 $('word-quiz-review').hidden=!(session?.phase==='done'&&session.weak.length);
}
function pause(){stopSound();$('word-quiz-play').hidden=true;$('word-quiz-home').hidden=false;
 $('vocabulary-list').hidden=false;summary();}
const canSpeak=()=>typeof window!=='undefined'&&'speechSynthesis' in window&&typeof SpeechSynthesisUtterance==='function';
function stopSound(){
 if(peekTimer){clearTimeout(peekTimer);peekTimer=null;}
 $('word-quiz-preview').hidden=true;
 if(canSpeak())window.speechSynthesis.cancel();
}
function availableLanguage(lang){return items.some(x=>x.language===lang);}
function chooseLanguage(lang){
 if(!availableLanguage(lang))return;
 stopSound();language=lang;allRounds=buildQuizRounds(items,lang);
 storeKey=practiceKey(scope,lang,items);applySession(saved());
 $('word-quiz-play').hidden=true;$('word-quiz-home').hidden=false;
 summary();
 $('word-quiz-options').hidden=true;
 $('vocabulary-list').hidden=false;
 /* The start button is controlled by saved progress, not the chosen language. */
 const untranslated=items.filter(i=>i.language==='en'&&!i.translation).length;
 $('word-quiz-description').textContent=lang==='en'
  ?'Oversett engelske ord til norsk. Deretter øver du på å kjenne igjen den riktige norske betydningen.'+
   (untranslated?' '+untranslated+' ord mangler sikker oversettelse og får kun lytte-/staveøvelse.':'')
  :'Øv på rettskriving: se og husk ordene, lytt til dem og finn vokalene.';
 for(const button of []){
  const selected=button.dataset.quizLanguage===lang;
  button.setAttribute('aria-pressed',String(selected));
 }
}
function renderWordQuiz(vocabulary,context){
 const key=[context?.school,context?.grade,context?.year,context?.week,context?.childId||'',JSON.stringify(vocabulary||[])].join(':');
 if(loadedKey===key)return;
 loadedKey=key;scope={...context};stopSound();
 items=quizItems(vocabulary).filter(item=>item.language===fixedLanguage);
 $('vocabulary-list').hidden=false;
 const panel=$('word-quiz');
 panel.hidden=items.length===0;
 if(!items.length)return;
 /* Separate language cards. */
 $('word-quiz-language').hidden=true;
 for(const button of []){
  button.hidden=!availableLanguage(button.dataset.quizLanguage);
 }
 chooseLanguage(fixedLanguage);
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
 answered=session?.phase==='answered'; 
 $('word-quiz-home').hidden=true;
 $('word-quiz-play').hidden=false;
 const percent=Math.round(100*(index+(answered?1:0))/rounds.length);
 $('word-quiz-track').setAttribute('aria-valuenow',String(percent));
 $('word-quiz-track-fill').style.width=percent+'%';
 $('word-quiz-pause').textContent='Lagre og fortsett senere';
 summary();
 $('word-quiz-progress').textContent=(session?.mode==='review'||index>=session?.baseCount?'↻ Repetisjon · ':'✨ Øving · ')+(index+1)+' av '+rounds.length+' · ⭐ '+score+' riktige';
 $('word-quiz-feedback').textContent='';
 $('word-quiz-next').hidden=true;
 $('word-quiz-start').textContent='Start på nytt';
 $('word-quiz-form').hidden=false;
 $('word-quiz-options').hidden=true;
 $('word-quiz-options').replaceChildren();
 $('word-quiz-answer').value='';
 $('word-quiz-answer').disabled=false;
 $('word-quiz-form').querySelector('[type=submit]').disabled=false;
 const kind=$('word-quiz-kind'),question=$('word-quiz-question'),tools=$('word-quiz-tools');
 $('word-quiz-peek').disabled=false;
 tools.hidden=false;
 $('word-quiz-speak').hidden=!canSpeak();
 $('word-quiz-peek').hidden=false;
 $('word-quiz-answer').placeholder=round.language==='en'?'Skriv svaret på norsk':'Skriv svaret';
 if(round.kind==='meaning'){
  kind.textContent='🇬🇧 Oversett til norsk';
  question.textContent='Hva betyr «'+round.word+'» på norsk?';
  $('word-quiz-answer').placeholder='Skriv den norske betydningen';
  $('word-quiz-peek').hidden=true;
 }else if(round.kind==='recognize'){
  kind.textContent='🧩 Finn riktig betydning';
  question.textContent='Hvilket norsk ord betyr det samme som «'+round.word+'»?';
  $('word-quiz-form').hidden=true;
  $('word-quiz-options').hidden=false;
  $('word-quiz-peek').hidden=true;
  for(const option of round.choices){
   const button=document.createElement('button');
   button.type='button';
   button.textContent=option;
   button.addEventListener('click',()=>submit(option));
   $('word-quiz-options').append(button);
  }
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
 if(answered){
  const ok=session.answers[index].ok;
  $('word-quiz-feedback').textContent=feedbackText(round,ok);
  $('word-quiz-answer').disabled=true;
  $('word-quiz-options').querySelectorAll('button').forEach(b=>b.disabled=true);
  $('word-quiz-form').querySelector('[type=submit]').disabled=true;
  $('word-quiz-tools').hidden=true;$('word-quiz-next').hidden=false;
 }else if(!$('word-quiz-form').hidden)$('word-quiz-answer').focus();
}
function feedbackText(round,correct){
 const expected=quizExpected(round);
 return correct?'🎉 Riktig! Bra jobbet.':(round.kind==='vowels'?'Vokalene er «'+expected+'».':
 ['meaning','recognize'].includes(round.kind)?'«'+round.word+'» betyr «'+expected+'» på norsk.':
 'Riktig ord er «'+expected+'».')+' Vi øver mer på dette ordet senere.';
}
function submit(chosen){
 if(answered||index>=rounds.length)return;
 const round=rounds[index],input=$('word-quiz-answer');
 const answer=String(chosen??input.value);
 if(!answer.trim())return;
 stopSound();
 const correct=isQuizAnswerCorrect(round,answer);
 applySession(practiceAnswer(session,correct));persist();
 $('word-quiz-feedback').textContent=feedbackText(round,correct);
 summary();
 const pct=Math.round(100*(index+1)/rounds.length);
 $('word-quiz-track').setAttribute('aria-valuenow',String(pct));
 $('word-quiz-track-fill').style.width=pct+'%';
 input.disabled=true;
 $('word-quiz-options').querySelectorAll('button').forEach(button=>button.disabled=true);
 $('word-quiz-form').querySelector('[type=submit]').disabled=true;
 $('word-quiz-tools').hidden=true;
 $('word-quiz-next').hidden=false;
}
function finish(){
 stopSound();
 $('word-quiz-progress').textContent='🏆 '+score+' av '+session.answers.length+' riktige';
 $('word-quiz-track').setAttribute('aria-valuenow','100');
 $('word-quiz-track-fill').style.width='100%';summary();
 $('word-quiz-kind').textContent='Ferdig!';
 $('word-quiz-question').textContent=session.weak.length?'Bra jobbet! Noen ord trenger mer øving – prøv en ny repetisjonsrunde.':'Flott jobbet! Alle øvelsene er fullført.';
 $('word-quiz-feedback').textContent='Du øvde på '+new Set(rounds.map(r=>r.word)).size+' ord.';
 $('word-quiz-form').hidden=true;
 $('word-quiz-options').hidden=true;
 $('word-quiz-tools').hidden=true;
 $('word-quiz-next').hidden=true;
 $('vocabulary-list').hidden=false;
 $('word-quiz-pause').textContent='Tilbake til øvestudio';
}
function initWordQuiz(){
 $('word-quiz-start').addEventListener('click',()=>{
  if(!session||session.phase==='done'){applySession(newPractice(allRounds,session?.weak||[]));persist();}
  if(rounds.length){$('vocabulary-list').hidden=true;showQuestion();}
 });
 $('word-quiz-review').addEventListener('click',()=>{
  applySession(newPractice(allRounds,session?.weak||[],'review'));persist();
  if(rounds.length){$('vocabulary-list').hidden=true;showQuestion();}
 });
 $('word-quiz-pause').addEventListener('click',pause);
 $('word-quiz-next').addEventListener('click',()=>{
  if(!answered)return;
  applySession(practiceNext(session));persist();
  if(session.phase==='done')finish();else showQuestion();
 });
 $('word-quiz-form').addEventListener('submit',event=>{event.preventDefault();submit();});
 $('word-quiz-peek').addEventListener('click',peek);
 $('word-quiz-speak').addEventListener('click',speak);
 [].forEach(button=>{
  button.addEventListener('click',()=>chooseLanguage(button.dataset.quizLanguage));
 });
}

 return {renderWordQuiz,initWordQuiz};
}
const englishQuiz=createQuizController('en','');
const norwegianQuiz=createQuizController('nb','-nb');
export function initWordQuiz(){
 // Unique IDs and independent event handlers prevent language state collisions.
 const source=document.getElementById('word-quiz');
 const destination=document.getElementById('word-quiz-nb');
 const replica=source.cloneNode(true);
 replica.id='word-quiz-nb';
 for(const node of replica.querySelectorAll('[id]'))node.id+='-nb';
 for(const node of replica.querySelectorAll('[for]'))node.htmlFor+='-nb';
 destination.replaceWith(replica);
 englishQuiz.initWordQuiz();norwegianQuiz.initWordQuiz();
}
export function renderWordQuiz(vocabulary,context){
 englishQuiz.renderWordQuiz(vocabulary,context);
 norwegianQuiz.renderWordQuiz(vocabulary,context);
}
