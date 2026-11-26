import test from 'node:test';
import assert from 'node:assert/strict';
import {checkProductionGuard} from '../scripts/production-guard.mjs';
const origin='https://www.skoleuka.no';
function mock({status=401,cache='private, no-store, max-age=0',html='<title>Driftsstatus – Skoleuka</title><script src="/drift/drift.mjs"></script>'}={}){
 const calls=[];
 return {calls,fetchImpl:async(url,opts)=>{
  calls.push({url,opts});
  if(url.pathname==='/drift/')return new Response(html);
  if(url.pathname==='/api/operations-health')return {status,headers:new Headers({'cache-control':cache}),text(){throw Error('Do not read private body');}};
  throw Error('Unexpected request');
 }};
}
test('Production guard is read-only and never sends credentials',async()=>{
 const {fetchImpl,calls}=mock();
 const result=await checkProductionGuard(origin,{fetchImpl});
 assert.deepEqual(result.errors,[]);
 assert.equal(calls.length,2);
 for(const {opts} of calls){assert.equal(opts.method,'GET');assert.equal(opts.redirect,'manual');assert.equal(opts.headers,undefined);assert.equal(opts.cache,'no-store');}
});
test('Fails closed on unexpected anonymous access, cache or stale dashboard',async()=>{
 const {fetchImpl}=mock({status:200,cache:'public, max-age=60',html:'stale'});
 const result=await checkProductionGuard(origin,{fetchImpl});
 assert.equal(result.errors.length,3);
});
test('Rejects origins with credentials or non-HTTPS',async()=>{
 for(const url of ['http://example.com','https://user:pass@example.com','https://example.com/path']){
  await assert.rejects(checkProductionGuard(url,{fetchImpl:mock().fetchImpl}),/HTTPS production origin/);
 }
});
