import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ORIGINAL_SOURCE_CANDIDATES,officialFetch,collectOfficialSamples} from '../scripts/collect-quality-originals.mjs';

const enc=new TextEncoder();
const answer=(content,url,{status=200}={})=>{
 const buffer=typeof content==='string'?enc.encode(content):content;
 return {ok:status===200,status,url,headers:new Headers({'content-length':String(buffer.length)}),
  arrayBuffer:async()=>buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength)};
};
test('Review manifest includes diverse known official school sources only',()=>{
 assert.ok(ORIGINAL_SOURCE_CANDIDATES.length>=4);
 assert.equal(new Set(ORIGINAL_SOURCE_CANDIDATES.map(x=>x.id)).size,ORIGINAL_SOURCE_CANDIDATES.length);
 assert.ok(new Set(ORIGINAL_SOURCE_CANDIDATES.map(x=>x.school)).size>=4);
 assert.ok(ORIGINAL_SOURCE_CANDIDATES.every(x=>x.url||x.section));
 assert.ok(ORIGINAL_SOURCE_CANDIDATES.every(x=>x.year===null||Number.isInteger(x.year)));
});
test('Retriever rejects nonofficial hosts and redirect outside allowlist',async()=>{
 await assert.rejects(officialFetch('https://example.com/evil.pdf',{pdf:true,fetchImpl:()=>{throw Error('should not fetch');}}),/not a permitted/);
 await assert.rejects(officialFetch('http://www.minskole.no/a.pdf',{pdf:true}),/not a permitted/);
 const redirected=async()=>answer('%PDF-1.7 sample','https://evil.example/a.pdf');
 await assert.rejects(officialFetch('https://www.minskole.no/a.pdf',{pdf:true,fetchImpl:redirected}),/Untrusted/);
 await assert.rejects(officialFetch('https://www.minskole.no/a.pdf',{pdf:true,fetchImpl:async()=>answer('NOT A PDF','https://www.minskole.no/a.pdf')}),/not a PDF/);
});
test('Temporary retrieval records PDF hash, page counts and source review state',async()=>{
 const out=mkdtempSync(join(tmpdir(),'skoleuka-original-'));
 const source='https://www.minskole.no/DynamicContent/Documents/test-uke-45.pdf';
 const bytes=enc.encode('%PDF-1.7 public test document');
 try{
  const manifest=await collectOfficialSamples({
   outDir:out,targets:[{id:'school-4-w45',school:'fagerholt',grade:'4',week:45,year:null,url:source}],
   fetchImpl:async url=>answer(bytes,url),
   parsePdf:async()=>[{width:600,height:800,items:[{text:'Lekser'}]}]});
  assert.equal(manifest.downloaded,1);
  assert.match(manifest.entries[0].sha256,/^[0-9a-f]{64}$/);
  assert.equal(manifest.entries[0].visualReview,'pending');
  assert.equal(manifest.entries[0].goldenFactsReview,'pending');
  assert.equal(manifest.entries[0].pages,1);
  assert.deepEqual(readdirSync(out).sort(),['school-4-w45.pdf','source-manifest.json']);
  assert.equal(JSON.parse(readFileSync(join(out,'source-manifest.json'))).downloaded,1);
 }finally{rmSync(out,{recursive:true,force:true});}
});
test('Missing official PDF is reported as unverified, never counted as a success',async()=>{
 const out=mkdtempSync(join(tmpdir(),'skoleuka-original-'));
 try{
  const r=await collectOfficialSamples({outDir:out,targets:[{id:'not-found',school:'fagerholt',grade:'4',week:45,year:2026,url:'https://www.minskole.no/dummy.pdf'}],
   fetchImpl:async u=>answer('',u,{status:404}),parsePdf:async()=>[]});
  assert.equal(r.downloaded,0);
  assert.equal(r.entries[0].download,'unverified');
  assert.match(r.entries[0].reason,/404/);
  assert.deepEqual(readdirSync(out),['source-manifest.json']);
 }finally{rmSync(out,{recursive:true,force:true});}
});