import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchJsonWithTimeout,DataLoadError} from '../public/network.mjs';

test('response resolves quickly with the correct JSON', async () => {
  const data = await fetchJsonWithTimeout('/api/weather', {
    timeoutMs: 200,
    fetchImpl: async () => new Response(JSON.stringify({days:{'2026-10-27':{temperature:12}}}),
      {headers:{'content-type':'application/json'}})
  });
  assert.equal(data.days['2026-10-27'].temperature,12);
});

test('missing Netlify function yields actionable error, not endless loading', async () => {
  await assert.rejects(
    fetchJsonWithTimeout('/api/plan', {timeoutMs:200,fetchImpl:async()=>new Response('Not Found',{status:404})}),
    err => err instanceof DataLoadError && err.code==='missing_api'
  );
});

test('HTML rewrite in place of a deployed function is detected', async () => {
  await assert.rejects(
    fetchJsonWithTimeout('/api/weather', {timeoutMs:200,fetchImpl:async()=>new Response('<html>app</html>',{headers:{'content-type':'text/html'}})}),
    err => err.code==='missing_api'
  );
});

test('indefinitely pending request times out even if fetch ignores abort signal', async () => {
  const began=Date.now();
  await assert.rejects(
    fetchJsonWithTimeout('/api/plan', {timeoutMs:50,fetchImpl:()=>new Promise(()=>{})}),
    err => err.code==='timeout'
  );
  assert.ok(Date.now()-began < 800);
});

test('indefinitely pending response body also times out', async () => {
  await assert.rejects(
    fetchJsonWithTimeout('/api/plan', {timeoutMs:50,fetchImpl:async()=>({ok:true,status:200,headers:{get:()=> 'application/json'},json:()=>new Promise(()=>{})})}),
    err => err.code==='timeout'
  );
});

test('a 502 JSON body propagates as a server error with context', async () => {
  await assert.rejects(
    fetchJsonWithTimeout('/api/plan', {timeoutMs:200,fetchImpl:async()=>new Response(JSON.stringify({warning:'PDF kunne ikke leses'}),{status:502,headers:{'content-type':'application/json'}})}),
    err => err.code==='server' && /PDF/.test(err.message)
  );
});
