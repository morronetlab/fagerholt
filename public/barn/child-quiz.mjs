/** PDF-grounded English and Norwegian quiz for a single child's device.
 * Reuses the ordinary Skoleuka quiz and practice engines, with no external AI.
 */
import {quizItems,buildQuizRounds,isQuizAnswerCorrect,quizExpected} from '../shared/word-quiz-core.mjs';
import {practiceKey,practiceRoundId,newPractice,restorePractice,practiceAnswer,practiceNext} from '../shared/word-practice-core.mjs';

const $=id=>document.getElementById(id);
let state={items:[],rounds:[],session:null,language:'',key:''},peekTimer=null;
const store=()=>{try{if(state.key&&state.session)localStorage.setItem(state.key,JSON.stringify(state.session));}catch{}};
const byRound=id=>state.rounds.find(round=>practiceRoundId(round)===id);
function hidePeek(){if(peekTimer)clearTimeout(peekTimer);peekTimer=null;$('child-quiz-preview').hidden=true;}
function getRound(){return state.session?byRound(state.session.queue[state.session.index]):null;}
function questionFor(round){
 if(round.kind==='recognize')return 'Hva betyr «'+round.word+'» på norsk?';
 if(round.kind==='meaning')return 'Hva betyr «'+round.word+'» på norsk?';
 if(round.kind==='vowels')return 'Hvilke vokaler finnes i «'+round.word+'», i riktig rekkefølge?';
 if(round.kind==='listen')return 'Lytt til ordet «'+round.word+'» og skriv det slik det staves.';
 return 'Se ordet kort, skjul det og skriv det riktig.';
}
function paint(){
 const s=state.session,round=getRound(),game=$('child-quiz-game');
 game.hidden=!s;
 $('child-quiz-choose').hidden=Boolean(s);
 if(!s)return;
 const count=s.queue.length;
 $('child-quiz-progress').textContent=s.phase==='done'?'🏆 Du er ferdig! '+s.answers.filter(x=>x.ok).length+
  ' riktige svar.':'Oppgave '+(s.index+1)+' av '+count+' · ⭐ '+s.answers.filter(x=>x.ok).length+' riktige';
 $('child-quiz-question').textContent=round?questionFor(round):
  'Flott jobbet! Øv gjerne en gang til på ordene du syntes var vanskelige.';
 const ended=s.phase==='done',answered=s.phase==='answered';
 $('child-quiz-form').hidden=ended||answered||round?.kind==='recognize';
 $('child-quiz-options').hidden=ended||answered||round?.kind!=='recognize';
 $('child-quiz-peek').hidden=ended||answered||!['memory','listen'].includes(round?.kind);
 $('child-quiz-next').hidden=!answered&&!ended;
 $('child-quiz-next').textContent=ended?'Start på nytt':'Neste oppgave →';
 $('child-quiz-feedback').textContent=answered?
  (s.answers.at(-1)?.ok?'✅ Riktig! Bra jobbet!':'Prøv å huske: '+quizExpected(round)):
  ended?'Økten er lagret på denne enheten.':'';
 if(round&&!answered&&!ended){
  $('child-quiz-answer').value='';
  $('child-quiz-answer').placeholder=round.kind==='vowels'?'Skriv vokalene':'Skriv ditt svar';
  if(round.kind==='recognize')$('child-quiz-options').innerHTML=(round.choices||[]).map((text,i)=>
   '<button type="button" data-child-quiz-choice="'+i+'"></button>').join('');
  if(round.kind==='recognize')$('child-quiz-options').querySelectorAll('button').forEach((b,i)=>{
   b.textContent=round.choices[i];
  });
 }
}
function saveAnswer(value){
 const round=getRound();
 if(!round||state.session.phase!=='question')return;
 state.session=practiceAnswer(state.session,isQuizAnswerCorrect(round,value));
 store();hidePeek();paint();
}
export function initChildQuiz(){
 $('child-quiz-choose').addEventListener('click',event=>{
  const button=event.target.closest('[data-child-quiz-language]');
  if(!button)return;
  const lang=button.dataset.childQuizLanguage;
  state.language=lang;
  state.rounds=buildQuizRounds(state.items,lang);
  const context=state.context;
  state.key=practiceKey(context,lang,state.items);
  let saved=null;
  try{saved=restorePractice(localStorage.getItem(state.key),state.rounds);}catch{}
  state.session=saved?.phase==='done'?newPractice(state.rounds,saved.weak):saved||newPractice(state.rounds);
  store();paint();
 });
 $('child-quiz-form').addEventListener('submit',event=>{
  event.preventDefault();saveAnswer($('child-quiz-answer').value.trim());
 });
 $('child-quiz-options').addEventListener('click',event=>{
  const button=event.target.closest('[data-child-quiz-choice]');
  const round=getRound();if(!button||!round)return;
  saveAnswer(round.choices?.[Number(button.dataset.childQuizChoice)]||'');
 });
 $('child-quiz-next').addEventListener('click',()=>{
  if(state.session?.phase==='done'){state.session=newPractice(state.rounds);}
  else state.session=practiceNext(state.session);
  store();paint();
 });
 $('child-quiz-pause').addEventListener('click',()=>{
  hidePeek();state.session=null;$('child-quiz-game').hidden=true;
  $('child-quiz-choose').hidden=false;
 });
 $('child-quiz-peek').addEventListener('click',()=>{
  const round=getRound();if(!round)return;
  hidePeek();$('child-quiz-preview').textContent=round.word;
  $('child-quiz-preview').hidden=false;
  $('child-quiz-peek').disabled=true;
  peekTimer=setTimeout(()=>{
   $('child-quiz-preview').hidden=true;$('child-quiz-peek').disabled=false;
   $('child-quiz-answer').focus();peekTimer=null;
  },4000);
 });
}
export function renderChildQuiz(vocabulary,{child,school,grade,year,week}){
 const items=quizItems(vocabulary||[]);
 const key=JSON.stringify([child?.id,school,grade,year,week,items]);
 if(state.scopeKey===key)return;
 hidePeek();$('child-quiz-peek').disabled=false;
 state={items,rounds:[],session:null,language:'',key:'',scopeKey:key,
  context:{childId:child?.id,school,grade,year,week}};
 const choices=['en','nb'].filter(lang=>items.some(item=>item.language===lang));
 $('child-quiz-section').hidden=!choices.length;
 $('child-quiz-game').hidden=true;
 $('child-quiz-choose').hidden=false;
 $('child-quiz-choose').innerHTML=choices.map(lang=>
  '<button type="button" class="child-primary" data-child-quiz-language="'+lang+'">'+
  (lang==='en'?'🇬🇧 Engelsk quiz':'🇳🇴 Norsk ordøving')+'</button>').join('');
}
