import test from 'node:test';
import assert from 'node:assert/strict';
import {priorityKey,applyPracticalPriority} from '../public/shared/practical-priority.mjs';
import {rankingCandidates,rankingKey,rankPracticalPlan} from '../lib/practical-priority.mjs';
import {createPracticalPriorityHandler} from '../netlify/functions/practical-priority.mjs';
import {cacheKey,createStatusToken} from '../lib/ai-runtime.mjs';

const pdf='https://www.minskole.no/DynamicContent/Documents/ukeplan-44.pdf';
const plan={parser:'ai',status:'ok',aiStatus:'ready',year:2026,week:44,
 grade:'3',schoolId:'fagerholt',pdf,
 notices:['Påmelding til leirskole innen mandag','Informasjon om skoledagens tema'],
 homework:[{subject:'Norsk',text:'Skriv et brev til rektor'}],
 everyday:[],dayNotes:{},attendance:[],
 days:{
  Mandag:{events:[{title:'Klassefotografering'}],bring:[{label:'Pent tøy'}]},
  Tirsdag:{events:[{title:'Vanlig matematikk'}],bring:[]}
 }};
const env={OPENAI_API_KEY:'test-only',AI_JOB_SECRET:'long-enough-secret-for-unit-tests-123',OPENAI_MODEL:'gpt-4.1-mini'};
const source={school:'fagerholt',grade:'3',year:2026,week:44,hash:'a'.repeat(64),model:'gpt-4.1-mini',pdf};
const token=createStatusToken(source,env.AI_JOB_SECRET);
const path='/api/practical-priority?job='+encodeURIComponent(token);
function memoryStore(){
 const map=new Map();
 return {map,get:async key=>map.get(key)||null,
  setJSON:async(key,value,{onlyIfNew=false}={})=>{
   if(onlyIfNew&&map.has(key))return {modified:false};
   map.set(key,value);return {modified:true};
  },
  delete:async key=>{map.delete(key);}
 };
}
const response=payload=>({ok:true,json:async()=>payload});
test('Priority candidates reuse only validated practical items, never homework or family names',()=>{
 const candidates=rankingCandidates(plan);
 assert.ok(candidates.length>=2);
 assert.ok(candidates.some(x=>x.text.includes('Påmelding')));
 assert.ok(!candidates.some(x=>x.text.includes('Skriv et brev')));
 assert.ok(candidates.every(x=>!x.text.includes('school-public-only')));
 assert.ok(candidates.every(x=>x.key===priorityKey({kind:x.kind,label:x.text})));
});
test('AI ratings are chosen by existing item ID and cannot insert invented content',async()=>{
 const candidates=rankingCandidates(plan);
 let requests=0;
 const scores=await rankPracticalPlan(plan,{apiKey:'unit-secret',fetchImpl:async(url,opts)=>{
  requests++;
  assert.equal(url,'https://api.openai.com/v1/responses');
  const input=JSON.stringify(JSON.parse(opts.body).input);
  assert.ok(!input.includes('Skriv et brev'));
  assert.ok(!input.includes('school-public-only'));
  return response({status:'completed',output:[{type:'message',content:[
   {type:'output_text',text:JSON.stringify({items:[
    {id:candidates[0].id,importance:3,prepareAhead:true},
    {id:'unrecognized',importance:3,prepareAhead:true},
    {id:candidates[1].id,importance:99,prepareAhead:true}
   ]})}
  ]}]});
 }});
 assert.equal(requests,1);
 assert.deepEqual(Object.keys(scores),[candidates[0].key]);
 assert.deepEqual(scores[candidates[0].key],{importance:3,prepareAhead:true});
});
test('AI importance controls ordering and keeps the original source text unchanged',()=>{
 const rows=[{id:'x',name:'Barn',label:'Mandag: vanlige klær',kind:'gear',priority:2,dayOrder:0},
  {id:'y',name:'Barn',label:'Påmelding innen mandag',kind:'notice',priority:3,dayOrder:0}];
 const key=priorityKey(rows[1]);
 const sorted=applyPracticalPriority(rows,{[key]:{importance:3,prepareAhead:true}});
 assert.equal(sorted[0].label,'Påmelding innen mandag');
 assert.equal(sorted[0].aiPrepareAhead,true);
 assert.equal(sorted[1].label,'Mandag: vanlige klær');
 assert.equal(rows[1].aiImportance,undefined);
});
test('Signed per-PDF ranking is cached; a repeated request makes no model call',async()=>{
 const store=memoryStore();
 const aiKey=cacheKey(source);store.map.set(aiKey,plan);
 let calls=0;
 const handle=createPracticalPriorityHandler({env,storeFactory:async()=>store,
  rank:async given=>{calls++;assert.equal(given,plan);
   return {[rankingCandidates(plan)[0].key]:{importance:3,prepareAhead:true}};}});
 const first=await (await handle(new Request('https://app.test'+path))).json();
 const second=await (await handle(new Request('https://app.test'+path))).json();
 assert.equal(first.status,'ready');assert.deepEqual(second,first);
 assert.equal(calls,1);
 assert.ok(store.map.has(rankingKey(aiKey)));
});
test('Invalid or unverified tokens never invoke ranking',async()=>{
 const store=memoryStore();let calls=0;
 const handle=createPracticalPriorityHandler({env,storeFactory:async()=>store,
  rank:async()=>{calls++;return {};}});
 const invalid=await handle(new Request('https://app.test/api/practical-priority?job=forged'));
 assert.equal(invalid.status,400);
 const missing=await handle(new Request('https://app.test'+path));
 assert.equal(missing.status,404);
 assert.equal(calls,0);
});
test('Concurrent parents share one ranking job and the other gets a processing response',async()=>{
 const store=memoryStore();store.map.set(cacheKey(source),plan);
 let release;
 const gate=new Promise(resolve=>{release=resolve;});
 let calls=0;
 const handle=createPracticalPriorityHandler({env,storeFactory:async()=>store,
  rank:async()=>{calls++;await gate;return {};}});
 const first=handle(new Request('https://app.test'+path));
 // Wait until the first ranking lock has been written without using timers.
 for(let i=0;i<20&&!store.map.has('locks/'+rankingKey(cacheKey(source)));i++)
  await Promise.resolve();
 const second=await (await handle(new Request('https://app.test'+path))).json();
 assert.equal(second.status,'processing');
 release();
 assert.equal((await (await first).json()).status,'ready');
 assert.equal(calls,1);
});
