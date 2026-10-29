/** PDF-grounded Norwegian and English word exercises. No AI or invented definitions. */
const headings=/^(?:ukas ord|ukens ord|ukas øveord|ukens øveord|engelske ord|engelske gloser|gloser|øveord|ord å øve på)\s*:?\s*/i;
const invalid=/\b(?:læringsmål|læringsmal|tema|kompetansemål|beskjeder|arbeidsmål)\b/i;
const word=/^[\p{L}]+(?:['-][\p{L}]+)*(?: [\p{L}]+(?:['-][\p{L}]+)*){0,2}$/u;
const shortWord=/^[\p{L}]+(?:['-][\p{L}]+)*$/u;
const normalize=s=>String(s??'').normalize('NFC').replace(/\s+/g,' ').trim();
const key=s=>normalize(s).toLocaleLowerCase('nb-NO');
const stop=/^(?:og|eller|med|skal|kan|som|for|til|fra|den|det|dette|les|skriv|lær|tema|mål|jeg|vi|dere|på|i|en|et)$/i;
// Only unambiguous classroom vocabulary; PDF-provided translations take priority.
const meaning=new Map(Object.entries({
 apple:'eple',banana:'banan',pear:'pære',orange:'appelsin',strawberry:'jordbær',
 dog:'hund',cat:'katt',bird:'fugl',fish:'fisk',horse:'hest',cow:'ku',pig:'gris',sheep:'sau',
 rabbit:'kanin',mouse:'mus',lion:'løve',tiger:'tiger',elephant:'elefant',
 red:'rød',blue:'blå',green:'grønn',yellow:'gul',black:'svart',white:'hvit',pink:'rosa',purple:'lilla',
 one:'én',two:'to',three:'tre',four:'fire',five:'fem',six:'seks',seven:'sju',eight:'åtte',nine:'ni',ten:'ti',
 sun:'sol',moon:'måne',star:'stjerne',rain:'regn',snow:'snø',wind:'vind',cloud:'sky',
 mother:'mor',father:'far',sister:'søster',brother:'bror',family:'familie',friend:'venn',
 school:'skole',teacher:'lærer',student:'elev',pencil:'blyant',pen:'penn',book:'bok',chair:'stol',table:'bord',
 house:'hus',home:'hjem',door:'dør',window:'vindu',room:'rom',garden:'hage',
 car:'bil',bus:'buss',train:'tog',bike:'sykkel',boat:'båt',
 water:'vann',milk:'melk',bread:'brød',cheese:'ost',egg:'egg',food:'mat',
 hand:'hånd',foot:'fot',head:'hode',eye:'øye',nose:'nese',mouth:'munn',ear:'øre',
 big:'stor',small:'liten',long:'lang',short:'kort',fast:'rask',slow:'langsom',happy:'glad',sad:'trist',
 morning:'morgen',evening:'kveld',night:'natt',day:'dag',week:'uke',year:'år',
 monday:'mandag',tuesday:'tirsdag',wednesday:'onsdag',thursday:'torsdag',friday:'fredag',
 hello:'hei',goodbye:'ha det',yes:'ja',no:'nei',please:'vær så snill',thanks:'takk',
 jump:'hoppe',run:'løpe',walk:'gå',swim:'svømme',read:'lese',write:'skrive',sing:'synge',
 play:'leke',eat:'spise',drink:'drikke',sleep:'sove',open:'åpne',close:'lukke'
}));
export function quizItems(entries){
 const found=new Map();
 for(const entry of Array.isArray(entries)?entries:[]){
  const category=typeof entry==='string'?'ukas ord':key(entry?.category);
  const language=/(?:engelsk|gloser)/.test(category)?'en':/(?:ukas ord|ukens ord|øveord|ord å øve på)/.test(category)?'nb':null;
  if(!language)continue;
  const raw=String(typeof entry==='string'?entry:entry?.text||'').normalize('NFC').replace(/[ \t]+/g,' ').trim().replace(headings,'');
  if(!raw||invalid.test(raw))continue;
  const pieces=raw.split(/[,;\n•|]+/).map(normalize).filter(Boolean);
  const compact=pieces.length===1?raw.split(/\s+/):[];
  const allSingles=compact.length>=2&&compact.length<=12&&compact.every(s=>shortWord.test(s)&&!stop.test(s));
  for(const piece of allSingles?compact:pieces){
   // Require spaces around an en/em/hyphen separator to avoid breaking hyphenated words.
   const paired=language==='en'?piece.match(/^(.+?)\s+(?:[-–—])\s+(.+)$/)||piece.match(/^(.+?)\s*(?:=|→)\s*(.+)$/):null;
   let original=normalize(paired?paired[1]:piece).replace(/[.!]+$/,'');
   let translation=normalize(paired?paired[2]:'').replace(/[.!]+$/,'');
   if(!word.test(original)||original.length>36||original.length<2)continue;
   // A glossary row may give several correct Norwegian forms, such as
  // «kostskole / internatskole». Both must be accepted as answers.
  if(translation&&(!translation.split(/\s*\/\s*/).every(part=>word.test(part))||translation.length>70))continue;
   // A source pair may use Norwegian first; recognize known reversed entries.
   if(translation&&meaning.get(key(translation))===key(original)){
    [original,translation]=[translation,original];
   }
   const id=language+':'+key(original);
   const previous=found.get(id);
   const documented=translation||null;
   const norwegian=language==='en'?(documented||meaning.get(key(original))||null):null;
   if(!previous||(!previous.translation&&documented))
    found.set(id,{word:original,language,translation:norwegian,fromPdf:Boolean(documented)});
  }
 }
 return [...found.values()].slice(0,35);
}
export const quizWords=entries=>quizItems(entries).map(x=>x.word);
export function buildQuizRounds(items,language){
 const selected=(items||[]).filter(i=>i.language===language).slice(0,12);
 if(language==='en'){
  const translated=selected.filter(i=>i.translation);
  const meanings=[...new Map(translated.map(i=>[key(i.translation),i.translation])).values()];
  const translate=translated.map(i=>({kind:'meaning',word:i.word,translation:i.translation,language}));
  // Only use real Norwegian translations from this week's source words as choices.
  // The child first recalls the meaning, then recognizes it among similar answers.
  const recognize=meanings.length>=3?translated.map((i,index)=>{
   const distractors=meanings.filter(t=>key(t)!==key(i.translation));
   const rotated=distractors.slice(index%distractors.length).concat(distractors.slice(0,index%distractors.length));
   const options=[i.translation,...rotated.slice(0,3)];
   const shift=(index+1)%options.length;
   return {kind:'recognize',word:i.word,translation:i.translation,language,
    choices:options.slice(shift).concat(options.slice(0,shift))};
  }):[];
  // If no trustworthy translation exists, offer a separate English listening/
  // spelling exercise; never invent a Norwegian meaning.
  const listen=selected.filter(i=>!i.translation).map(i=>({kind:'listen',word:i.word,language}));
  return [...translate,...recognize,...listen];
 }
 return [
  ...selected.map(i=>({kind:'memory',word:i.word,language})),
  ...selected.map(i=>({kind:'vowels',word:i.word,language}))
 ];
}
export function quizExpected(round){
 return round?.kind==='vowels'?[...round.word.toLocaleLowerCase('nb-NO')].filter(c=>'aeiouyæøå'.includes(c)).join(''):
  ['meaning','recognize'].includes(round?.kind)?round?.translation||'':round?.word||'';
}
export function isQuizAnswerCorrect(round,answer){
 const expected=quizExpected(round);
 const normalized=s=>round?.kind==='vowels'?key(s).replace(/[\s,.-]/g,''):key(s);
 if(['meaning','recognize'].includes(round?.kind)&&expected.includes('/')){
  const allowed=[expected,...expected.split(/\s*\/\s*/).map(s=>s.trim())];
  return allowed.some(value=>normalized(answer)===normalized(value));
 }
 return Boolean(expected)&&normalized(answer)===normalized(expected);
}
