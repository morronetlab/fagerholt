import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_SCHEMA,normalizeAIPlan,interpretPdfWithAI} from '../lib/ai-plan.mjs';
import {digestPdf,cacheKey,signJob,validSignature,queueAIJob,failureKey,jobOrigin} from '../lib/ai-runtime.mjs';
import {createAIBackgroundHandler} from '../netlify/functions/ai-plan-background.mjs';
import {createPlanHandler} from '../netlify/functions/plan.mjs';
import {siteConfig} from '../public/site-config.mjs';

const pdfBytes=new TextEncoder().encode('%PDF-1.7 test content');
const source=siteConfig.school.grades['4'];
const pdf='https://www.minskole.no/DynamicContent/Documents/854-fagerholt-ukeplan-uke-44.pdf';
const quote='Vi skal svømme på torsdag og ta med badetøy';
const item={sourcePage:1,sourceQuote:quote};
const aiRaw={days:[{day:'Torsdag',events:[{...item,title:'Svømming i svømmehallen',time:null}]}],
 homework:[{...item,dueDay:'Torsdag',subject:'Norsk',text:'Les kapittel 3'},{...item,dueDay:'Torsdag',subject:'Matematikk',text:'Gjør oppgave 4'}],
 packing:[{...item,day:'Torsdag',label:'Badetøy',note:null,evidence:'explicit'},
  {...item,day:'Torsdag',label:'Håndkle',note:null,evidence:'inferred'}],
 notices:[{...item,day:'Torsdag',text:'Husk svømming'},{...item,day:null,text:'Foreldremøte neste uke'}],
 learningGoals:[{...item,text:'Jeg kan beskrive former'}],subjects:[{...item,text:'Matematikk og norsk'}],weekTheme:{...item,text:'Vann'},optionalMission:{text:null,sourcePage:null,sourceQuote:''}};
const meta={grade:'4',year:2026,week:44,source,pdf,pageCount:1,pageTexts:[quote]};
function memoryStore(){
 const map=new Map();return {map,
  async get(key){return map.get(key)||null;},
  async setJSON(key,value,{onlyIfNew=false}={}){if(onlyIfNew&&map.has(key))return {modified:false};map.set(key,value);return {modified:true};},
  async delete(key){map.delete(key);}
 };
}
const env={OPENAI_API_KEY:'test-key',AI_JOB_SECRET:'test-secret-example-more-than-24-chars',DEPLOY_URL:'https://preview.example'};
const body={grade:'4',year:2026,week:44,source,pdf,hash:digestPdf(pdfBytes)};
const key=cacheKey({school:'fagerholt',...body});
function webResponse(contents,url){const data=new TextEncoder().encode(contents);return {ok:true,status:200,url,headers:new Headers({'content-length':String(data.length)}),arrayBuffer:async()=>data.buffer};}

// Validator ensures model output is never directly trusted by the browser.
test('AI output preserves complete day events, 4th grade due dates and source-specific gear',()=>{
 const homeworkEvidence=aiRaw.homework.map(x=>({...x,sourceQuote:'Lekser til torsdag: Norsk: Les kapittel 3. Matematikk: Gjør oppgave 4'}));
 const normalized=normalizeAIPlan({...aiRaw,homework:homeworkEvidence},{...meta,pageTexts:[quote+' Lekser til torsdag: Norsk: Les kapittel 3. Matematikk: Gjør oppgave 4']});
 assert.equal(normalized.parser,'ai');
 assert.equal(normalized.days.Torsdag.events.length,2);
 assert.deepEqual(normalized.homework.map(x=>x.subject),['Til torsdag']);
 assert.match(normalized.homework[0].text,/Norsk: Les kapittel 3/);
 assert.match(normalized.homework[0].text,/Matematikk: Gjør oppgave 4/);
 assert.equal(normalized.days.Torsdag.bring[0].label,'Badetøy');
 assert.match(normalized.days.Torsdag.bring[1].note,/Forslag/);
 assert.deepEqual(normalized.notices,['Foreldremøte neste uke']);
 assert.deepEqual(normalized.subjects,['Matematikk og norsk']);
});
test('AI drops ungrounded evidence and unknown weekdays',()=>{
 const raw=structuredClone(aiRaw);
 raw.packing.push({day:'Torsdag',label:'Kostyme',evidence:'explicit',note:null,sourcePage:null,sourceQuote:''});
 raw.days.push({day:'Søndag',events:[{...item,title:'Falsk',time:null}]});
 raw.homework.push({dueDay:'Mandag',subject:null,text:'Oppdiktet',sourcePage:2,sourceQuote:'Nei'});
 const normalized=normalizeAIPlan(raw,meta);
 assert.ok(!normalized.days.Torsdag.bring.some(x=>x.label==='Kostyme'));
 assert.ok(!normalized.homework.some(x=>/Oppdiktet/.test(x.text)));
});
test('OpenAI Files API uploads a binary PDF, references file_id and deletes the temporary file',async()=>{
 const requests=[];
 const mock=async (url,opts)=>{
  requests.push({url,opts});
  if(url==='https://api.openai.com/v1/files')return {ok:true,json:async()=>({id:'file-test-123'})};
  if(url==='https://api.openai.com/v1/responses')return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(aiRaw)}]}]})};
  if(url==='https://api.openai.com/v1/files/file-test-123')return {ok:true,status:200};
  throw Error('Unexpected URL '+url);
 };
 const result=await interpretPdfWithAI(pdfBytes,{...meta,fetchImpl:mock,apiKey:'test-key',model:'gpt-4.1-mini'});
 assert.equal(result.parser,'ai');
 assert.deepEqual(requests.map(r=>[r.opts.method,r.url]),[
  ['POST','https://api.openai.com/v1/files'],
  ['POST','https://api.openai.com/v1/responses'],
  ['DELETE','https://api.openai.com/v1/files/file-test-123']
 ]);
 const upload=requests[0].opts.body;
 assert.ok(upload instanceof FormData);
 assert.equal(upload.get('purpose'),'user_data');
 assert.equal(upload.get('file').name,'ukeplan.pdf');
 assert.equal(upload.get('file').type,'application/pdf');
 assert.equal(await upload.get('file').text(),new TextDecoder().decode(pdfBytes));
 assert.ok(!requests[0].opts.headers['Content-Type'],'Fetch must create multipart boundary');
 const response=JSON.parse(requests[1].opts.body);
 assert.equal(response.store,false);
 assert.equal(response.input[1].content[1].type,'input_file');
 assert.equal(response.input[1].content[1].file_id,'file-test-123');
 assert.equal(response.input[1].content[1].detail,'high');
 assert.ok(!('file_data' in response.input[1].content[1]));
 assert.equal(response.text.format.strict,true);
 assert.equal(AI_SCHEMA.additionalProperties,false);
});
test('Failed OpenAI analysis deletes uploaded PDF and surfaces a readable server error',async()=>{
 const calls=[];
 const mock=async (url,opts)=>{
  calls.push([opts.method,url]);
  if(url.endsWith('/v1/files'))return {ok:true,json:async()=>({id:'file-mocked'})};
  if(url.endsWith('/v1/responses'))return {ok:false,status:400,json:async()=>({error:{message:'Unsupported PDF format for this model'}})};
  if(url.endsWith('/v1/files/file-mocked'))return {ok:true,status:200};
 };
 await assert.rejects(interpretPdfWithAI(pdfBytes,{...meta,fetchImpl:mock,apiKey:'test-key'}),/AI-analyse: OpenAI svarte 400: Unsupported PDF format/);
 assert.equal(calls[2][0],'DELETE');
});
test('OpenAI PDF upload errors do not attempt cleanup without an uploaded file',async()=>{
 const calls=[];
 const mock=async(url,opts)=>{
  calls.push([url,opts.method]);
  return {ok:false,status:403,json:async()=>({error:{message:'Insufficient project permissions'}})};
 };
 await assert.rejects(interpretPdfWithAI(pdfBytes,{...meta,fetchImpl:mock,apiKey:'test-key'}),/Opplasting av PDF: OpenAI svarte 403/);
 assert.equal(calls.length,1);
});
test('Netlify Deploy Preview AI job calls stay on the preview host, never production',async()=>{
 const previewEnv={...env,DEPLOY_URL:undefined,URL:'https://skolesekken.netlify.app',SITE_NAME:'skolesekken'};
 const preview='https://deploy-preview-9--skolesekken.netlify.app';
 assert.equal(jobOrigin(new Request(`${preview}/api/plan?grade=4`),previewEnv),preview);
 assert.equal(jobOrigin(new Request('https://skolesekken.netlify.app/api/plan?grade=4'),previewEnv),
   'https://skolesekken.netlify.app');
 // Do not trust caller-supplied hosts from another Netlify site.
 assert.equal(jobOrigin(new Request('https://deploy-preview-9--other.netlify.app/api/plan'),previewEnv),
   'https://skolesekken.netlify.app');
 const store=memoryStore();const calls=[];
 const result=await queueAIJob({request:new Request(`${preview}/api/plan?grade=4`),
  job:body,key,store,env:previewEnv,dispatchImpl:async url=>{calls.push(url);return {status:202};}});
 assert.equal(result,'processing');
 assert.deepEqual(calls,[`${preview}/.netlify/functions/ai-plan-background`]);
});

test('invalid signature and forged public background requests are blocked',async()=>{
 const run=createAIBackgroundHandler({env,storeFactory:async()=>{throw Error('Must not get store');}});
 const invalid=await run(new Request('https://preview.example/.netlify/functions/ai-plan-background',{method:'POST',headers:{'X-Weekplan-Signature':'false'},body:JSON.stringify(body)}));
 assert.equal(invalid.status,401);
 assert.equal(validSignature(JSON.stringify(body),signJob(JSON.stringify(body),env.AI_JOB_SECRET),env.AI_JOB_SECRET),true);
});
test('cached AI result is served without PDF.js and without re-dispatch',async()=>{
 const store=memoryStore();store.map.set(key,{...normalizeAIPlan(aiRaw,meta),model:'gpt-4.1-mini',homeworkSourceVersion:1});
 let parseCount=0,queueCount=0;
 const handler=createPlanHandler({env,now:()=>new Date('2026-10-27T12:00:00Z'),storeFactory:async()=>store,
  parsePdfPages:async()=>{parseCount++;return [];},queueJob:async()=>{queueCount++;},
  fetchImpl:async url=>url===source?webResponse(`<a href="${pdf}">Ukeplan uke 44</a>`,url):webResponse('%PDF-1.7 test content',url)});
 const response=await handler(new Request('https://preview.example/api/plan?grade=4'));
 const result=await response.json();
 assert.equal(result.aiStatus,'ready');assert.equal(result.parser,'ai');
 assert.equal(queueCount,0);assert.equal(parseCount,0);
});
test('Changed PDF contents under the same URL start a new AI job; old hash stays cached',async()=>{
 const store=memoryStore();
 store.map.set(key,{...normalizeAIPlan(aiRaw,meta),schoolId:'fagerholt',homeworkSourceVersion:1});
 const changedPdf='%PDF-1.7 test content, revised after publication';
 const changedHash=digestPdf(new TextEncoder().encode(changedPdf));
 let queuedKey=null,queued=0;
 const handler=createPlanHandler({env,now:()=>new Date('2026-10-27T12:00:00Z'),
  storeFactory:async()=>store,
  queueJob:async ({key:requested})=>{queued++;queuedKey=requested;return 'processing';},
  parsePdfPages:async()=>{throw Error('AI pending: rule parser should not run');},
  fetchImpl:async url=>url===source?
   webResponse('<a href="'+pdf+'">Ukeplan uke 44</a>',url):
   webResponse(changedPdf,url)
 });
 const result=await (await handler(new Request('https://preview.example/api/plan?grade=4'))).json();
 assert.equal(result.aiStatus,'processing');
 assert.equal(queued,1);
 assert.notEqual(queuedKey,key,'A revised PDF must not use the old document hash');
 assert.equal(queuedKey,cacheKey({school:'fagerholt',...body,hash:changedHash}));
 assert.equal((await store.get(key)).parser,'ai','Old document is preserved for historical lookups');
});
test('cache miss starts one signed job and provides rule-based fallback',async()=>{
 const store=memoryStore(),payloads=[];
 const job={...body};
 const enqueue=async x=>queueAIJob({...x,dispatchImpl:async (url,opts)=>{payloads.push({url,opts});return {status:202}}});
 const handler=createPlanHandler({env,now:()=>new Date('2026-10-27T12:00:00Z'),storeFactory:async()=>store,
  queueJob:enqueue,parsePdfPages:async()=>[{width:500,height:700,items:[]}],
  fetchImpl:async url=>url===source?webResponse(`<a href="${pdf}">Ukeplan uke 44</a>`,url):webResponse('%PDF-1.7 test content',url)});
 const a=await (await handler(new Request('https://preview.example/api/plan?grade=4'))).json();
 const b=await (await handler(new Request('https://preview.example/api/plan?grade=4'))).json();
 assert.equal(a.aiStatus,'processing');assert.equal(b.aiStatus,'processing');
 assert.equal(payloads.length,1);
 assert.equal(payloads[0].url,'https://preview.example/.netlify/functions/ai-plan-background');
 assert.equal(validSignature(payloads[0].opts.body,payloads[0].opts.headers['X-Weekplan-Signature'],env.AI_JOB_SECRET),true);
});
test('background function verifies PDF hash and saves AI JSON once',async()=>{
 const store=memoryStore();
 const handler=createAIBackgroundHandler({env,storeFactory:async()=>store,
  parsePages:async()=>[{items:[{text:quote}]}],
  interpret:async()=>normalizeAIPlan(aiRaw,meta),
  fetchImpl:async()=>webResponse('%PDF-1.7 test content',pdf)});
 const data=JSON.stringify(body);const headers={'X-Weekplan-Signature':signJob(data,env.AI_JOB_SECRET)};
 const response=await handler(new Request('https://preview.example/.netlify/functions/ai-plan-background',{method:'POST',headers,body:data}));
 assert.equal(response.status,204);
 assert.equal((await store.get(key)).parser,'ai');
 assert.equal((await store.get('locks/'+key)),null);
});

test('Background keeps an independent PDF for AI when PDF.js detaches its input buffer',async()=>{
 const store=memoryStore();
 let aiReceivedValidPdf=false;
 const handler=createAIBackgroundHandler({env,storeFactory:async()=>store,
  parsePages:async received=>{
   // Mirror PDF.js transferring its data into a worker, which detaches `received`.
   const transferred=structuredClone(received.buffer,{transfer:[received.buffer]});
   assert.equal(transferred.byteLength,pdfBytes.byteLength);
   assert.equal(received.byteLength,0);
   return [{items:[{text:quote}]}];
  },
  interpret:async input=>{
   aiReceivedValidPdf=new TextDecoder().decode(input)===new TextDecoder().decode(pdfBytes);
   if(!aiReceivedValidPdf)throw Error('AI received a detached/empty PDF buffer');
   return normalizeAIPlan(aiRaw,meta);
  },
  fetchImpl:async()=>webResponse('%PDF-1.7 test content',pdf)});
 const signedBody=JSON.stringify(body);
 const response=await handler(new Request('https://preview.example/.netlify/functions/ai-plan-background',{
  method:'POST',headers:{'X-Weekplan-Signature':signJob(signedBody,env.AI_JOB_SECRET)},body:signedBody}));
 assert.equal(response.status,204);
 assert.equal(aiReceivedValidPdf,true);
 assert.equal((await store.get(key)).parser,'ai');
});

test('Failed AI attempt is shown as failed instead of dispatching again during cooldown',async()=>{
 const store=memoryStore();let dispatches=0;
 await store.setJSON(failureKey(key),{retryAt:1_000_000});
 const result=await queueAIJob({request:new Request('https://preview.example/api/plan?grade=4'),job:body,key,store,env,
   dispatchImpl:async()=>{dispatches++;return {status:202};},now:()=>900_000});
 assert.equal(result,'failed');
 assert.equal(dispatches,0);
 const refreshed=await queueAIJob({request:new Request('https://preview.example/api/plan?grade=4'),job:body,key,store,env,
   dispatchImpl:async()=>{dispatches++;return {status:202};},now:()=>1_000_001});
 assert.equal(refreshed,'processing');
 assert.equal(dispatches,1);
});
test('Plan API labels rule fallback when AI is temporarily failed',async()=>{
 const store=memoryStore();await store.setJSON(failureKey(key),{retryAt:Date.now()+300000});
 const handler=createPlanHandler({env,now:()=>new Date('2026-10-27T12:00:00Z'),storeFactory:async()=>store,
  parsePdfPages:async()=>[{width:500,height:700,items:[]}],
  fetchImpl:async url=>url===source?webResponse(`<a href="${pdf}">Ukeplan uke 44</a>`,url):webResponse('%PDF-1.7 test content',url)});
 const result=await (await handler(new Request('https://preview.example/api/plan?grade=4'))).json();
 assert.equal(result.aiStatus,'failed');
 assert.equal(result.parser,'rules');
 assert.match(result.warning,/AI-analysen feilet/);
});

test('Pre-existing cached AI homework is repaired from PDF columns once, persisted and served correctly',async()=>{
 const store=memoryStore(),tokens=(text,x,y)=>({text,x,y,width:text.length*5});
 const page={width:600,height:750,items:[
  tokens('LEKSER UKE 44',100,105),
  tokens('Til tirsdag',125,148),tokens('Til torsdag',330,148),
  tokens('Norsk: Les teksten i norskboka.',128,196),
  tokens('Matte: Gjør oppgavene på arket.',333,196),
  tokens('Ukelekse',110,323),
  tokens('Sosialt: Vi øver på å høre etter.',115,350)
 ]};
 const broken={...normalizeAIPlan(aiRaw,meta),schoolId:'fagerholt',model:'gpt-4.1-mini',
  homework:[{subject:'Norsk',text:'Les teksten i norskboka.',dueDay:null,repeatDays:[]},
   {subject:'Matte',text:'Gjør oppgavene på arket.',dueDay:null,repeatDays:[]},
   {subject:'Norsk',text:'Leksefri på onsdag',dueDay:null,repeatDays:[]}],
  homeworkSourceVersion:undefined};
 store.map.set(key,broken);
 let parses=0,dispatches=0;
 const handler=createPlanHandler({env,now:()=>new Date('2026-10-27T12:00:00Z'),
  storeFactory:async()=>store,
  parsePdfPages:async()=>{parses++;return [page];},
  queueJob:async()=>{dispatches++;},
  fetchImpl:async url=>url===source?
    webResponse('<a href="'+pdf+'">Ukeplan uke 44</a>',url):
    webResponse('%PDF-1.7 test content',url)});
 const url='https://preview.example/api/plan?school=fagerholt&grade=4';
 const first=await (await handler(new Request(url))).json();
 assert.equal(first.parser,'ai');assert.equal(first.aiStatus,'ready');
 assert.deepEqual(first.homework.map(x=>[x.subject,x.dueDay]),[
  ['Norsk','Tirsdag'],['Matte','Torsdag'],['Sosialt',null]]);
 assert.equal(first.homeworkSourceVerified,true);
 assert.equal(first.homeworkSourceVersion,1);
 const second=await (await handler(new Request(url))).json();
 assert.deepEqual(second.homework,first.homework);
 assert.equal(parses,1,'The PDF should be parsed only once per cached document/version');
 assert.equal(dispatches,0,'No model re-run is necessary');
 assert.equal((await store.get(key)).homeworkSourceVersion,1,'Corrected cached result persists');
});
