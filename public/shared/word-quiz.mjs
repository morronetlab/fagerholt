/** Small, local word challenge. No AI guesses and no made-up translations. */
const $=id=>document.getElementById(id);
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
const headings=/^(?:ukas ord|ukens ord|engelske ord|engelske gloser|gloser|øveord|ord å øve på)\s*:?\s*/i;
const forbidden=/\b(?:læringsmål|læringsmal|tema|kompetansemål|beskjeder|arbeidsmål)\b/i;
export function quizWords(entries){
 const words=[];
 for(const item of Array.isArray(entries)?entries:[]){
  const text=clean(typeof item==='string'?item:item?.text);
  if(!text||forbidden.test(text))continue;
  const raw=text.replace(headings,'');
  for(const part of raw.split(/[,;\n•]+/)){
   const candidate=clean(part).replace(/[.!]+$/,'');
   // Only single words (or short hyphenated words); never whole sentences or learning goals.
   if(!/^[a-zæøåA-ZÆØÅ]+(?:[-'][a-zæøåA-ZÆØÅ]+)*$/.test(candidate))continue;
   if(candidate.length<2||candidate.length>28)continue;
   words.push(candidate);
  }
 }
 return [...new Map(words.map(w=>[w.toLocaleLowerCase('nb-NO'),w])).values()].slice(0,24);
}
let words=[],index=0,score=0,answered=false;
function showQuestion(){
 const word=words[index];
 $('word-quiz-play').hidden=false;
 $('word-quiz-progress').textContent=`Ord ${index+1} av ${words.length} · ⭐ ${score} poeng`;
 $('word-quiz-feedback').textContent='';
 $('word-quiz-next').hidden=true;answered=false;
 $('word-quiz-question').textContent=`Hvordan skriver du dette ordet riktig? ${word.split('').map((ch,i)=>i===0?ch:'_').join(' ')}`;
 const distractors=words.filter(w=>w.toLocaleLowerCase('nb-NO')!==word.toLocaleLowerCase('nb-NO'));
 const choices=Array.from(new Set([word,...distractors])).slice(0,4);
 if(choices.length>=3){
  $('word-quiz-form').hidden=true;
  // Deterministic rotation, avoids always putting correct answer first.
  const order=choices.slice(index%choices.length).concat(choices.slice(0,index%choices.length));
  const options=$('word-quiz-options');options.replaceChildren();
  for(const choice of order){const button=document.createElement('button');button.type='button';button.textContent=choice;button.addEventListener('click',()=>submit(choice));options.append(button);}
 }else{
  $('word-quiz-options').replaceChildren();
  $('word-quiz-form').hidden=false;
  $('word-quiz-answer').value='';
  $('word-quiz-answer').focus();
 }
}
function submit(value){
 if(answered)return;answered=true;
 const correct=clean(value).toLocaleLowerCase('nb-NO')===words[index].toLocaleLowerCase('nb-NO');
 if(correct)score++;
 $('word-quiz-feedback').textContent=correct?'🎉 Helt riktig!':`Riktig skrivemåte er: ${words[index]}`;
 $('word-quiz-next').hidden=false;
 $('word-quiz-options').querySelectorAll('button').forEach(b=>b.disabled=true);
}
export function renderWordQuiz(vocabulary,context){
 const key=[context?.school,context?.grade,context?.year,context?.week].join(':');
 if($('word-quiz').dataset.key===key)return;
 $('word-quiz').dataset.key=key;
 words=quizWords(vocabulary);index=0;score=0;
 $('word-quiz').hidden=words.length===0;
 $('word-quiz-play').hidden=true;
 $('word-quiz-start').textContent='Start quiz';
}
export function initWordQuiz(){
 $('word-quiz-start').addEventListener('click',()=>{index=0;score=0;if(words.length)showQuestion();});
 $('word-quiz-next').addEventListener('click',()=>{
  index++;
  if(index>=words.length){
   $('word-quiz-progress').textContent=`🏆 Du fikk ${score} av ${words.length} riktige!`;
   $('word-quiz-question').textContent='Bra jobbet!';
   $('word-quiz-options').replaceChildren();$('word-quiz-form').hidden=true;
   $('word-quiz-next').hidden=true;$('word-quiz-feedback').textContent='Trykk Start quiz for å prøve igjen.';
  }else showQuestion();
 });
 $('word-quiz-form').addEventListener('submit',e=>{e.preventDefault();submit($('word-quiz-answer').value);});
}
