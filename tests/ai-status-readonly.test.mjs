import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPlanHandler} from '../netlify/functions/plan.mjs';
import {digestPdf,cacheKey,lockKey,failureKey,createStatusToken} from '../lib/ai-runtime.mjs';
import {createAIStatusHandler} from '../netlify/functions/ai-status.mjs';
import {siteConfig} from '../public/site-config.mjs';
import {planFeedback} from '../public/shared/plan-feedback.mjs';

const source=siteConfig.school.grades['4'];
const pdf='https://www.minskole.no/DynamicContent/Documents/fagerholt-uke44.pdf';
const pdfBytes=new TextEncoder().encode('%PDF-1.7 valid fixture');
const hash=digestPdf(pdfBytes);
const key=cacheKey({school:'fagerholt',grade:'4',year:2026,week:44,hash,model:'gpt-4.1-mini'});
const env={OPENAI_API_KEY:'test-key',AI_JOB_SECRET:'long-test-secret-at-least-24-characters',DEPLOY_URL:'https://preview.example'};
const now=()=>new Date('2026-10-28T12:00:00Z');
const request=()=>new Request('https://preview.example/api/plan?school=fagerholt&grade=4&statusOnly=1');
const mkResponse=(text,url)=>{const bytes=new TextEncoder().encode(text);return {ok:true,status:200,url,headers:new Headers({'content-length':String(bytes.length)}),arrayBuffer:async()=>bytes.buffer};};
function setup(){
 const data=new Map(),called=[];
 let parsed=0,queued=0;
 const handler=createPlanHandler({
   env,now,storeFactory:async()=>({get:async k=>data.get(k)||null}),
   fetchImpl:async url=>{called.push(url);if(url===source)return mkResponse(`<a href="${pdf}">Ukeplan uke 44</a>`,url);if(url===pdf)return mkResponse('%PDF-1.7 valid fixture',url);throw Error('Untrusted URL '+url);},
   parsePdfPages:async()=>{parsed++;throw Error('Status check must not parse the PDF');},
   queueJob:async()=>{queued++;throw Error('Status check must never queue an AI job');}
 });
 return {data,called,handler,counts:()=>({parsed,queued})};
}

test('Sjekk AI-status reads an active job without queuing or parsing again',async()=>{
 const x=setup();x.data.set(lockKey(key),{expiresAt:Date.now()+120000});
 const out=await (await x.handler(request())).json();
 assert.equal(out.aiStatus,'processing');
 assert.equal(out.pdf,pdf);
 assert.deepEqual(x.counts(),{parsed:0,queued:0});
 assert.deepEqual(x.called,[source,pdf]);
});
test('Sjekk AI-status returns the completed, cached plan when the job finishes',async()=>{
 const x=setup();x.data.set(key,{parser:'ai',schoolId:'fagerholt',grade:'4',week:44,year:2026,pdf,
   days:{},homework:[{text:'Les boka'}],status:'ok'});
 const out=await (await x.handler(request())).json();
 assert.equal(out.aiStatus,'ready');assert.equal(out.homework[0].text,'Les boka');
 assert.deepEqual(x.counts(),{parsed:0,queued:0});
});
test('Cached plans from before the fix never return synthetic messages or guessed gear',async()=>{
 const x=setup(),marker='Ta med: Refleks (sjekk hvilken dag i PDF-en)';
 const second='Ta med: Engelskboka (sjekk hvilken dag i PDF-en)';
 const cached={parser:'ai',schoolId:'fagerholt',grade:'4',year:2026,week:44,pdf,
  homeworkSourceVersion:1,status:'ok',notices:[marker,{text:second},'Husk klassefest torsdag.'],
  days:{Mandag:{events:[],bring:[{label:'Refleks',note:'Forslag ut fra aktivitet i PDF-en'}]}},
  everyday:[{label:'Badetøy',note:'Forslag ut fra aktivitet i PDF-en'}]};
 x.data.set(key,cached);
 const canonical=await (await x.handler(request())).json();
 assert.deepEqual(canonical.notices,['Husk klassefest torsdag.']);
 assert.deepEqual(canonical.days.Mandag.bring,[]);
 assert.deepEqual(canonical.everyday,[]);
 assert.deepEqual(x.counts(),{parsed:0,queued:0});
 const token=createStatusToken({school:'fagerholt',grade:'4',year:2026,week:44,
  hash,model:'gpt-4.1-mini',pdf},env.AI_JOB_SECRET);
 const status=createAIStatusHandler({env,storeFactory:async()=>({get:async name=>x.data.get(name)||null})});
 const polled=await (await status(new Request('https://preview.example/api/ai-status?job='+encodeURIComponent(token)))).json();
 assert.equal(polled.aiStatus,'ready');
 assert.deepEqual(polled.notices,['Husk klassefest torsdag.']);
 assert.deepEqual(polled.days.Mandag.bring,[]);
 assert.equal(x.data.get(key),cached,'The original shared Netlify cache is not mutated');
});
test('Failed or missing job is reported, never secretly restarted by status poll',async()=>{
 const x=setup();x.data.set(failureKey(key),{retryAt:Date.now()+120000});
 let out=await (await x.handler(request())).json();
 assert.equal(out.aiStatus,'failed');
 assert.match(out.warning,/Prøv igjen/);
 x.data.delete(failureKey(key));
 out=await (await x.handler(request())).json();
 assert.equal(out.aiStatus,'failed');
 assert.deepEqual(x.counts(),{parsed:0,queued:0});
});
test('Status button preserves current plan and elapsed time while waiting',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/\$\('feedback-retry'\)\.addEventListener\('click',\(\)=>state\.plan\?\.aiStatus==='processing'\?reload\(\{quiet:true,statusOnly:true\}\):reload\(\)\)/);
 assert.match(app,/statusOnly=1/);
 assert.match(app,/if\(statusOnly&&state\.plan\?\.aiStatus==='processing'&&fresh\.aiStatus==='processing'\)/);
 assert.match(app,/state\.statusChecking=true;/);
 assert.match(app,/state\.statusChecking\)\)return;/);
 const feedback=planFeedback({school:{name:'Skole',homepage:'https://www.minskole.no'},grade:'4',
   plan:{aiStatus:'failed',status:'partial',pdf}});
 assert.equal(feedback.showRetry,true);
 assert.equal(feedback.kind,'missing');
});
