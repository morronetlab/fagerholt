import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_SCHEMA,normalizeAIPlan,interpretPdfWithAI} from '../lib/ai-plan.mjs';
import {digestPdf,cacheKey,signJob,validSignature,queueAIJob} from '../lib/ai-runtime.mjs';
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
 const normalized=normalizeAIPlan(aiRaw,meta);
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
test('Requests API sends PDF visually, with schema, store:false and no client API key',async()=>{
 let request;
 const mock=async (url,opts)=>{
  request={url,opts,body:JSON.parse(opts.body)};
  return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(aiRaw)}]}]})};
 };
 const result=await interpretPdfWithAI(pdfBytes,{...meta,fetchImpl:mock,apiKey:'test-key',model:'gpt-4.1-mini'});
 assert.equal(result.parser,'ai');
 assert.equal(request.url,'https://api.openai.com/v1/responses');
 assert.equal(request.body.store,false);
 assert.equal(request.body.input[1].content[1].type,'input_file');
 assert.equal(request.body.input[1].content[1].detail,'high');
 assert.equal(request.body.text.format.strict,true);
 assert.equal(AI_SCHEMA.additionalProperties,false);
});
test('invalid signature and forged public background requests are blocked',async()=>{
 const run=createAIBackgroundHandler({env,storeFactory:async()=>{throw Error('Must not get store');}});
 const invalid=await run(new Request('https://preview.example/.netlify/functions/ai-plan-background',{method:'POST',headers:{'X-Weekplan-Signature':'false'},body:JSON.stringify(body)}));
 assert.equal(invalid.status,401);
 assert.equal(validSignature(JSON.stringify(body),signJob(JSON.stringify(body),env.AI_JOB_SECRET),env.AI_JOB_SECRET),true);
});
test('cached AI result is served without PDF.js and without re-dispatch',async()=>{
 const store=memoryStore();store.map.set(key,{...normalizeAIPlan(aiRaw,meta),model:'gpt-4.1-mini'});
 let parseCount=0,queueCount=0;
 const handler=createPlanHandler({env,now:()=>new Date('2026-10-27T12:00:00Z'),storeFactory:async()=>store,
  parsePdfPages:async()=>{parseCount++;return [];},queueJob:async()=>{queueCount++;},
  fetchImpl:async url=>url===source?webResponse(`<a href="${pdf}">Ukeplan uke 44</a>`,url):webResponse('%PDF-1.7 test content',url)});
 const response=await handler(new Request('https://preview.example/api/plan?grade=4'));
 const result=await response.json();
 assert.equal(result.aiStatus,'ready');assert.equal(result.parser,'ai');
 assert.equal(queueCount,0);assert.equal(parseCount,0);
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
