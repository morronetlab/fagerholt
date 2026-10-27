import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/plan.mjs';
import {osloCalendar} from '../lib/plan-core.mjs';
test('API never shows a previous week as current', async()=>{
 const fetchBefore=globalThis.fetch;
 const {week}=osloCalendar(); const stale=week===1?52:week-1;
 globalThis.fetch=async()=>new Response(`<h2>Ukeplan</h2><a href="/DynamicContent/Documents/uke-${stale}.pdf">Uke ${stale} PDF</a>`,{status:200,headers:{'content-type':'text/html'}});
 try{
  const resp=await handler(new Request('https://example.netlify.app/api/plan?grade=3'));
  const body=await resp.json();
  assert.equal(resp.status,200);assert.equal(body.status,'unpublished');assert.equal(body.week,week);assert.equal(body.pdf,null);
 }finally{globalThis.fetch=fetchBefore}
});
test('API rejects invalid grade',async()=>{
 const response=await handler(new Request('https://example.netlify.app/api/plan?grade=8'));
 assert.equal(response.status,400);
});
