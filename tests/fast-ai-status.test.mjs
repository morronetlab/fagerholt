import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStatusToken,readStatusToken,cacheKey,lockKey,failureKey,digestPdf} from '../lib/ai-runtime.mjs';
import {createAIStatusHandler} from '../netlify/functions/ai-status.mjs';
import {createPlanHandler} from '../netlify/functions/plan.mjs';
import {siteConfig} from '../public/site-config.mjs';
const env={OPENAI_API_KEY:'test-openai',AI_JOB_SECRET:'a-very-long-test-key-for-signatures',DEPLOY_URL:'https://preview.example'};
const pdf='https://www.minskole.no/DynamicContent/Documents/ukeplan-44.pdf';
const pdfText='%PDF-1.7 test content',bytes=new TextEncoder().encode(pdfText);
const meta={school:'fagerholt',grade:'4',year:2026,week:44,hash:digestPdf(bytes),model:'gpt-4.1-mini',pdf};
const key=cacheKey(meta);
const response=(body,url)=>{const raw=new TextEncoder().encode(body);return {ok:true,status:200,url,headers:new Headers({'content-length':String(raw.length)}),arrayBuffer:async()=>raw.buffer};};
const store=()=>{const map=new Map();return{map,async get(k){return map.get(k)||null;},async setJSON(k,v){map.set(k,v);},async delete(k){map.delete(k);}};};
test('Signed AI status token rejects tampering and expiry',()=>{
 const t=createStatusToken(meta,env.AI_JOB_SECRET,1000);
 assert.equal(readStatusToken(t,env.AI_JOB_SECRET,2000).hash,meta.hash);
 assert.equal(readStatusToken(t,env.AI_JOB_SECRET,1000+25*3600*1000),null);
 assert.equal(readStatusToken(t.slice(0,-1)+(t.endsWith('a')?'b':'a'),env.AI_JOB_SECRET,2000),null);
 assert.equal(readStatusToken(t,'wrong-secret',2000),null);
});
test('Read-only AI status reads only Netlify Blobs and never fetches or dispatches',async()=>{
 const s=store(),now=Date.now();
 s.map.set(lockKey(key),{expiresAt:now+120000});
 const handler=createAIStatusHandler({storeFactory:async()=>s,env,now:()=>now});
 const token=createStatusToken(meta,env.AI_JOB_SECRET,now);
 const req=()=>new Request('https://preview.example/api/ai-status?job='+encodeURIComponent(token));
 const pending=await (await handler(req())).json();
 assert.equal(pending.aiStatus,'processing');
 s.map.set(key,{parser:'ai',schoolId:'fagerholt',grade:'4',year:2026,week:44,pdf,days:{},homework:[]});
 const ready=await (await handler(req())).json();
 assert.equal(ready.aiStatus,'ready');assert.equal(ready.parser,'ai');
 s.map.delete(key);s.map.set(failureKey(key),{retryAt:now+90000});
 assert.equal((await (await handler(req())).json()).aiStatus,'failed');
});
test('Initial PDF load returns signed job handle without redundant PDF.js parsing',async()=>{
 let parsed=0,queued=0;
 const source=siteConfig.school.grades['4'],s=store();
 const handler=createPlanHandler({env,now:()=>new Date('2026-10-27T12:00:00Z'),storeFactory:async()=>s,
  queueJob:async()=>{queued++;return 'processing';},
  parsePdfPages:async()=>{parsed++;throw Error('PDF should not be parsed while AI is processing');},
  fetchImpl:async url=>url===source?response(`<a href="${pdf}">Ukeplan uke 44</a>`,url):response(pdfText,url)});
 const out=await (await handler(new Request('https://preview.example/api/plan?grade=4'))).json();
 assert.equal(out.aiStatus,'processing');
 assert.equal(typeof out.jobId,'string');
 assert.equal(parsed,0);assert.equal(queued,1);
 assert.equal(readStatusToken(out.jobId,env.AI_JOB_SECRET).hash,meta.hash);
});
test('Client polls signed status endpoint every three seconds and keeps the normal load URL',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const toml=readFileSync(new URL('../netlify.toml',import.meta.url),'utf8');
 assert.match(app,/\/api\/ai-status\?job=/);
 assert.match(app,/state\.aiPolls<240/);
 assert.match(app,/\},3000\);/);
 assert.match(app,/\/api\/plan\?school=/);
 assert.match(toml,/from = "\/api\/ai-status"/);
});
