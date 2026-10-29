/** Read-only smoke check of live deployment and official PDFs; log only counts. */
import {schoolCalendar} from '../lib/calendar.mjs';
import {pdfPages} from '../netlify/functions/plan.mjs';
import {extractEnglishGlossaries} from '../lib/english-glossaries.mjs';
import {extractNorwegianWordLists} from '../lib/norwegian-word-lists.mjs';
import {quizItems,buildQuizRounds} from '../public/shared/word-quiz-core.mjs';

const base=(process.env.PRODUCTION_URL||'https://ukeplanen.netlify.app').replace(/\/$/,'');
const expected=process.env.EXPECTED_COMMIT||null;
const current=schoolCalendar(new Date(),'Europe/Oslo');
const checks=[],warnings=[],errors=[];
async function get(url,{binary=false,timeout=65000}={}){
 const r=await fetch(new URL(url,base),{signal:AbortSignal.timeout(timeout),headers:{'User-Agent':'Ukeplanen/production-verification'}});
 if(!r.ok)throw Error('HTTP '+r.status+' '+new URL(url,base).pathname);
 return binary?new Uint8Array(await r.arrayBuffer()):r;
}
const getJson=async url=>(await get(url)).json();
async function inspect(school,candidates){
 let grades;
 try{
  grades=(await getJson('/api/grades?school='+school)).grades?.map(x=>x.code)||[];
  checks.push({type:'grades',school,found:grades.length});
 }catch(e){errors.push(school+' grade discovery: '+e.message);return;}
 const grade=candidates.find(x=>grades.includes(x));
 if(!grade){warnings.push(school+': requested classes not listed');return;}
 let plan;
 try{
  plan=await getJson('/api/plan?school='+school+'&grade='+grade);
  // Poll only the signed read-only status endpoint; no repeated PDF parsing
  // and no extra AI-job dispatches.
  if(plan.aiStatus==='processing'&&plan.jobId){
   for(let attempt=0;attempt<3;attempt++){
    await new Promise(resolve=>setTimeout(resolve,8000));
    const status=await getJson('/api/ai-status?job='+encodeURIComponent(plan.jobId));
    if(status.aiStatus==='ready'){plan=status;break;}
    if(status.aiStatus==='failed'){plan.aiStatus='failed';break;}
   }
  }
  if(school==='sjostrand'&&grade==='2'){
   const homework=(plan.homework||[]).map(x=>x.text||'').join(' ');
   const wednesday=(plan.dayNotes?.Onsdag||[]).map(x=>x.text||'').join(' ');
   const friday=(plan.days?.Fredag?.bring||[]).map(x=>x.label||'').join(' ');
   const vaccineOk=/vaksin/i.test(wednesday);
   const shoesOk=/gymsko/i.test(friday);
   const homeworkClean=!/vaksin|gymsko/i.test(homework);
   checks.push({type:'practical-classification',school,grade,vaccineOnWednesday:vaccineOk,shoesOnFriday:shoesOk,notInHomework:homeworkClean});
   if(plan.aiStatus==='ready'&&(!vaccineOk||!shoesOk||!homeworkClean))
    errors.push('sjostrand 2: practical vaccine/gymsko information placed incorrectly');
  }
  checks.push({type:'plan',school,grade,status:plan.status,ai:plan.aiStatus||null,
   week:plan.week,year:plan.year,homework:plan.homework?.length||0,vocabulary:plan.vocabulary?.length||0});
  if(plan.week!==current.week||plan.year!==current.year)errors.push(school+' '+grade+': wrong requested school week');
  if(plan.status==='error')errors.push(school+' '+grade+': production plan endpoint returned an error');
  if(['unpublished','unavailable'].includes(plan.status)){
   warnings.push(school+' '+grade+': PDF not published for the current week');return;
  }
  if(!plan.pdf)throw Error('No original PDF link in plan');
  const host=new URL(plan.pdf).hostname;
  if(!['www.minskole.no','minskole.no','www.minskule.no','minskule.no'].includes(host))throw Error('Untrusted PDF host');
  const bytes=await get(plan.pdf,{binary:true});
  if(String.fromCharCode(...bytes.slice(0,4))!=='%PDF')throw Error('Original source is not a PDF');
  const pages=await pdfPages(bytes);
  const sourceWords=quizItems(extractEnglishGlossaries(pages)).filter(x=>x.language==='en');
  if(school==='sjostrand'&&grade==='2'){
   const words=quizItems(extractNorwegianWordLists(pages)).filter(x=>x.language==='nb');
   const diag=pages.flatMap(p=>(p.items||[]).filter(x=>/øveord|skjorte|skjegg|skjell|skjære/i.test(x.text))
    .map(x=>({text:x.text,x:Math.round(x.x),y:Math.round(x.y),pageWidth:Math.round(p.width),pageHeight:Math.round(p.height)})));
   console.log('PDF WORD COORDINATES',JSON.stringify(diag));
   checks.push({type:'source-norwegian-words',school,grade,sourceWords:words.length});
   if(current.week===44&&current.year===2026&&
      words.map(x=>x.word).join('|')!=='skjorte|skjegg|skjell|skjære')
    errors.push('Sjøstrand 2: direct source PDF extraction failed for the four documented exercise words');
  }
  const sourceText=pages.flatMap(p=>p.items.map(x=>x.text)).join(' ');
  if(school==='sjostrand'&&grade==='2'&&/(?:ukas ord|ukens ord|øveord)/i.test(sourceText)){
   const hasNorwegian=(plan.vocabulary||[]).some(x=>/ukas ord|ukens ord|øveord/i.test(x.category||''));
   checks.push({type:'norwegian-wordlist',school,grade,pdfHasHeading:true,planHasWords:hasNorwegian});
   if(!hasNorwegian)warnings.push('Sjøstrand 2: original PDF contains a Norwegian word-list heading, but live plan has no such vocabulary');
  }
  checks.push({type:'source',school,grade,pages:pages.length,textTokens:pages.reduce((n,p)=>n+p.items.length,0),englishPairs:sourceWords.length});
  if(sourceWords.length){
   if(plan.aiStatus==='processing'||plan.aiStatus==='failed'){
    warnings.push(school+' '+grade+': source has English glossary but AI is '+plan.aiStatus);
   }else{
    const actual=quizItems(plan.vocabulary||[]).filter(x=>x.language==='en');
    const names=new Set(actual.map(x=>x.word.toLowerCase()));
    const missing=sourceWords.filter(x=>!names.has(x.word.toLowerCase())).length;
    if(missing||!actual.length)errors.push(school+' '+grade+': '+missing+' words missing from live English quiz');
    if(actual.length&&!buildQuizRounds(actual,'en').some(x=>x.kind==='meaning'))
     errors.push(school+' '+grade+': no Norwegian translation questions');
   }
  }
  if(plan.aiStatus==='processing'||plan.aiStatus==='failed')
   warnings.push(school+' '+grade+': full plan not yet confirmed, AI '+plan.aiStatus);
 }catch(e){errors.push(school+' '+grade+': '+e.message);}
}
try{
 const [home,build]=await Promise.all([(await get('/')).text(),getJson('/build-info.json')]);
 checks.push({type:'deployment',commit:build.commit,expected,week:current.week,year:current.year});
 if(!home.includes('id="school-gate"')||!home.includes('id="word-quiz"'))errors.push('Production homepage missing quiz or school gate');
 if(!/^[a-f0-9]{40}$/i.test(build.commit||''))errors.push('Production build SHA missing');
 else if(expected&&build.commit!==expected)errors.push('Production build does not match latest main: '+build.commit);
}catch(e){errors.push('Production deployment: '+e.message);}
await inspect('fagerholt',['3','7']);
await inspect('sjostrand',['5A']);
await inspect('sjostrand',['2A','2B','2']);
console.log('LIVE PRODUCTION VERIFIED RESULTS\n'+JSON.stringify({checks,warnings,errors},null,2));
if(errors.length)process.exitCode=1;
