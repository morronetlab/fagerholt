import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyProduction} from '../scripts/verify-production.mjs';
const commit='d59482caea66b90143da256fc0791cd83079499a';
const mock=({deployed=commit,drift=200,api=401,cache='no-store'}={})=>{
 const calls=[];
 const fetchImpl=async (url,options)=>{
  calls.push({path:url.pathname,options});
  if(url.pathname==='/build-info.json')return new Response(JSON.stringify({commit:deployed}),{status:200});
  if(url.pathname==='/drift/')return new Response('<title>Driftsstatus – Skoleuka</title><script src="/drift/drift.mjs"></script>',{status:drift});
  if(url.pathname==='/api/operations-health')return new Response('{}',{status:api,headers:{'cache-control':cache}});
  throw Error('Unexpected request '+url.pathname);
 };
 return {fetchImpl,calls};
};
test('Production smoke checks use no admin token',async()=>{
 const {fetchImpl,calls}=mock();
 assert.equal((await verifyProduction({expectedCommit:commit,fetchImpl})).checks.length,3);
 assert.deepEqual(calls.map(x=>x.path),['/build-info.json','/drift/','/api/operations-health']);
 assert.ok(calls.every(x=>x.options.redirect==='manual'&&x.options.cache==='no-store'&&!('Authorization' in x.options.headers)));
});
test('Detects outdated deploy',async()=>{
 await assert.rejects(verifyProduction({expectedCommit:commit,fetchImpl:mock({deployed:'a'.repeat(40)}).fetchImpl}),/does not match/);
});
test('Rejects broken drift and exposed or cached admin API',async()=>{
 for(const [config,error] of [[{drift:404},/unavailable/],[{api:200},/HTTP 401/],[{cache:'public'},/no-store/]]){
  await assert.rejects(verifyProduction({expectedCommit:commit,fetchImpl:mock(config).fetchImpl}),error);
 }
});
test('Requires HTTPS origin and full SHA',async()=>{
 await assert.rejects(verifyProduction({expectedCommit:commit,origin:'http://localhost/'}),/HTTPS/);
 await assert.rejects(verifyProduction({expectedCommit:'d59482c'}),/40-character/);
});
