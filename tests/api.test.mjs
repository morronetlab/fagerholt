import test from 'node:test';import assert from 'node:assert/strict';
import {createPlanHandler} from '../netlify/functions/plan.mjs';
import {siteConfig} from '../public/site-config.mjs';
const DATE=()=>new Date('2026-10-27T11:00:00Z');
const binary=data=>new TextEncoder().encode(data);
function response(body,url,status=200){return {ok:status>=200&&status<300,status,url,headers:new Headers({'content-length':String(binary(body).byteLength)}),arrayBuffer:async()=>binary(body).buffer};}
const emptyPages=async()=>[{width:600,height:800,items:[]}];
test('for each of grades 1–7 only its own section and PDF are fetched',async()=>{
 for(let grade=1;grade<=7;grade++){
  const visited=[];const source=siteConfig.school.grades[String(grade)];
  const pdf=`https://www.minskole.no/fagerholt/${grade}/uke44.pdf`;
  const get=async url=>{
   visited.push(url);
   if(url===source)return response(`<a href="${pdf}">Uke 44 PDF</a>`,url);
   if(url===pdf)return response('%PDF-1.7',url);
   throw new Error('Unapproved URL fetched');
  };
  const handler=createPlanHandler({fetchImpl:get,parsePdfPages:emptyPages,now:DATE});
  const result=await handler(new Request(`https://app.example/api/plan?grade=${grade}`));
  assert.equal(result.status,200);
  const data=await result.json();
  assert.equal(data.grade,String(grade));assert.equal(data.pdf,pdf);
  assert.equal(data.status,'unreadable');assert.deepEqual(visited,[source,pdf]);
 }
});
test('no grade, unknown grade and malicious query do not make network requests',async()=>{
 let count=0;const handler=createPlanHandler({fetchImpl:async()=>{count++;throw Error('must not request');},now:DATE});
 for(const query of ['','?grade=8','?grade=https%3A%2F%2Fevil.test','?grade=3%2F..']){
  const res=await handler(new Request(`https://example.com/api/plan${query}`));
  assert.equal(res.status,400);
 }assert.equal(count,0);
});
test('unpublished current week is not substituted with older PDF',async()=>{
 const source=siteConfig.school.grades['3'];
 const handler=createPlanHandler({fetchImpl:async url=>{
  assert.equal(url,source);
  return response('<a href="/fagerholt/uke43.pdf">Uke 43</a>',url);
 },now:DATE});
 const res=await handler(new Request('https://example.com/api/plan?grade=3'));
 assert.equal(res.status,200);const body=await res.json();
 assert.equal(body.status,'unpublished');assert.equal(body.pdf,null);
});
test('invalid PDF and suspicious redirect return error with no fake plan',async()=>{
 const source=siteConfig.school.grades['2'];
 const handler=createPlanHandler({fetchImpl:async url=>url===source?response('<a href="/fagerholt/a_uke44.pdf">Uke 44</a>',url):response('not pdf',url),now:DATE});
 const res=await handler(new Request('https://example.com/api/plan?grade=2'));
 assert.equal(res.status,502);assert.equal((await res.json()).status,'error');
});

test('source fetch outages are not reported as school choosing not to publish a PDF',async()=>{
 const source=siteConfig.school.grades['3'];
 const handler=createPlanHandler({now:DATE,env:{},fetchImpl:async url=>{
  assert.equal(url,source);
  return response('Unavailable',url,503);
 }});
 const res=await handler(new Request('https://app.example/api/plan?grade=3'));
 assert.equal(res.status,502);
 const body=await res.json();
 assert.equal(body.status,'error');
 assert.equal(body.errorCode,'school_page_failed');
 assert.equal(body.source,source);
 assert.equal(body.pdf,undefined);
 assert.match(body.warning,/Dette betyr ikke at ukeplanen mangler/);
});
test('download and PDF parser failures preserve official PDF link and distinct error codes',async()=>{
 const source=siteConfig.school.grades['3'];
 const pdf='https://www.minskole.no/fagerholt/uke44.pdf';
 const fetchImpl=async url=>url===source?
  response('<a href="'+pdf+'">Uke 44</a>',source):
  response('%PDF-1.7',pdf);
 const failedDownload=createPlanHandler({now:DATE,env:{},fetchImpl:async url=>url===source?
  response('<a href="'+pdf+'">Uke 44</a>',source):
  response('Server failed',pdf,503)});
 const downloadResponse=await failedDownload(new Request('https://app.example/api/plan?grade=3'));
 assert.equal(downloadResponse.status,502);
 const download=await downloadResponse.json();
 assert.equal(download.errorCode,'pdf_download_failed');
 assert.equal(download.pdf,pdf);
 assert.match(download.warning,/kunne ikke lastes ned/i);
 const failedParse=createPlanHandler({now:DATE,env:{},fetchImpl,
  parsePdfPages:async()=>{throw Error('PDF parsing failed');}});
 const parseResponse=await failedParse(new Request('https://app.example/api/plan?grade=3'));
 assert.equal(parseResponse.status,502);
 const parsed=await parseResponse.json();
 assert.equal(parsed.errorCode,'pdf_parse_failed');
 assert.equal(parsed.pdf,pdf);
 assert.match(parsed.warning,/kunne ikke tolkes/i);
});
