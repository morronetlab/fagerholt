import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCurrentPdfs,checkCurrentPlan} from '../scripts/evaluate-current-pdf-quality.mjs';
import {DAYS} from '../lib/calendar.mjs';

const targets=[{school:'fagerholt',grade:'4'}];
const now=new Date('2026-11-26T08:00:00Z');
const section='https://www.minskole.no/fagerholt/seksjon/22637';
const current='https://www.minskole.no/DynamicContent/Documents/Ukeplan-uke-48.pdf';
const old='https://www.minskole.no/DynamicContent/Documents/Ukeplan-uke-47.pdf';
const pages=[{width:600,height:800,items:[{text:'Norsk: Les i boka',x:20,y:40,width:80}]}];
const validPlan=(p,grade,pdf,week,year,source)=>({grade,pdf,week,year,source,
 parsedFromPdf:true,status:'partial',homework:[],notices:[],
 days:Object.fromEntries(DAYS.map(d=>[d,{events:[],bring:[]}]))});
function setup({links='<a href="'+old+'">Ukeplan uke 47</a><a href="'+current+'">Ukeplan uke 48</a>',pdfStatus=200,parsePlan=validPlan,extractPdf=async()=>pages}={}){
 const calls=[];
 const fetchImpl=async url=>{
  calls.push(String(url));
  if(String(url)===section)return new Response(links);
  if(String(url)===current)return new Response('%PDF-1.7 mock',{status:pdfStatus});
  throw Error('Unexpected request');
 };
 return {calls,options:{targets,now,fetchImpl,extractPdf,parsePlan}};
}
test('Current week discovered dynamically; prior-week PDF is never fetched',async()=>{
 const {calls,options}=setup();
 const r=await evaluateCurrentPdfs(options);
 assert.equal(r.year,2026);assert.equal(r.week,48);assert.equal(r.passed,true);
 assert.deepEqual(calls,[section,current]);
 assert.match(r.cases[0].sha256,/^[a-f0-9]{64}$/);
 assert.equal(r.cases[0].status,'verified');
});
test('Missing current week is not counted as a passing source',async()=>{
 const {calls,options}=setup({links:'<a href="'+old+'">Ukeplan uke 47</a>'});
 const r=await evaluateCurrentPdfs(options);
 assert.equal(r.passed,false);assert.equal(r.unpublished,1);assert.equal(r.verified,0);
 assert.deepEqual(calls,[section]);
});
test('Current linked 404 and parser regressions still fail',async()=>{
 const unavailable=await evaluateCurrentPdfs(setup({pdfStatus:404}).options);
 assert.equal(unavailable.passed,false);assert.equal(unavailable.errors,1);
 const invalid=await evaluateCurrentPdfs(setup({parsePlan:(...args)=>({...validPlan(...args),week:47})}).options);
 assert.equal(invalid.passed,false);
 assert.match(invalid.cases[0].errors.join(' '),/identity/);
});
test('An image-only PDF is reported separately, not passed',async()=>{
 const r=await evaluateCurrentPdfs(setup({extractPdf:async()=>[{items:[]}]}).options);
 assert.equal(r.noTextLayer,1);assert.equal(r.passed,false);
});
test('Closed day cannot keep events and homework must use real weekdays',()=>{
 const plan=validPlan(pages,'4',current,48,2026,section);
 plan.days.Fredag={closed:true,events:[{}],bring:[]};
 plan.homework=[{dueDay:'Søndag'}];
 const errors=checkCurrentPlan(plan,pages,{grade:'4',pdf:current,week:48,year:2026,source:section});
 assert.ok(errors.includes('Invalid homework weekday'));
 assert.ok(errors.includes('Closed day contains school events or packing'));
 assert.ok(errors.includes('Closure differs from current-week PDF evidence'));
});
