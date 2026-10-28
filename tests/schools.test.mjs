import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {siteConfig} from '../public/site-config.mjs';
import {getSchool,discoverGradeSections,isSchoolSectionUrl,gradesForSchool,locateGradeSections} from '../lib/schools.mjs';
import {createPlanHandler} from '../netlify/functions/plan.mjs';
import {createGradesHandler} from '../netlify/functions/grades.mjs';
import {schoolSelectionKey,gradeSelectionKey,progressKey,validSchool} from '../public/shared/selection.mjs';
import {cacheKey} from '../lib/ai-runtime.mjs';

const sourceFixtures={
 dvergsnes:'<nav><a href="/dvergsnes/seksjon/21672">1.trinn</a><a href="/dvergsnes/seksjon/21673">2.trinn</a></nav>',
 haanes:'<nav><a href="/haanes/seksjon/22362">2. trinn</a></nav>',
 langenes:'<nav><a href="https://minskole.no/langenes/seksjon/22710">7. trinn</a></nav>'
};
const bytes=s=>new TextEncoder().encode(s);
const response=(s,url)=>{const b=bytes(s);return {ok:true,status:200,url,headers:new Headers({'content-length':String(b.length)}),arrayBuffer:async()=>b.buffer.slice(0)};};
const fixedDate=()=>new Date('2026-10-27T11:00:00Z');
const p='https://www.minskole.no/DynamicContent/Documents/testing-uke-44.pdf';

test('municipal primary school registry contains 26 primary and 4 combined schools, no private or secondary-only',()=>{
 const all=Object.values(siteConfig.schools);
 assert.equal(all.length,30);
 assert.equal(all.filter(s=>s.kind==='primary').length,26);
 assert.equal(all.filter(s=>s.kind==='combined').length,4);
 assert.equal(new Set(all.map(s=>s.id)).size,30);
 assert.ok(all.every(s=>s.homepage.startsWith('https://www.minskole.no/')));
 for(const id of ['fagerholt','dvergsnes','kjm','langenes','lundeskole','nygaard','ross','todda','finsland','ve'])assert.ok(getSchool(id),id);
 assert.equal(getSchool('undefined'),null);
 assert.equal(validSchool('fagerholt',siteConfig.schools),true);
});
test('realistic navigation identifies separate grade section URLs for three different schools',()=>{
 assert.deepEqual(discoverGradeSections(sourceFixtures.dvergsnes,getSchool('dvergsnes')),
  {'1':'https://www.minskole.no/dvergsnes/seksjon/21672','2':'https://www.minskole.no/dvergsnes/seksjon/21673'});
 assert.deepEqual(discoverGradeSections(sourceFixtures.haanes,getSchool('haanes')),
  {'2':'https://www.minskole.no/haanes/seksjon/22362'});
 assert.deepEqual(discoverGradeSections(sourceFixtures.langenes,getSchool('langenes')),
  {'7':'https://minskole.no/langenes/seksjon/22710'});
});
test('rejects other school, fake grade headings, malicious protocols and external hosts',()=>{
 const school=getSchool('dvergsnes');
 const html=`<a href="/fagerholt/seksjon/22637">4. trinn</a>
 <a href="https://evil.test/dvergsnes/seksjon/111">3. trinn</a>
 <a href="javascript:alert(1)">7. trinn</a>
 <a href="/dvergsnes/seksjon/900">1.-2. trinn</a>
 <a href="/dvergsnes/seksjon/222">SFO</a>
 <a href='/dvergsnes/seksjon/333'>4. trinn</a>`;
 assert.deepEqual(discoverGradeSections(html,school),{'4':'https://www.minskole.no/dvergsnes/seksjon/333'});
 assert.equal(isSchoolSectionUrl('https://www.minskole.no/fagerholt/seksjon/22637',school,'4'),false);
 assert.equal(isSchoolSectionUrl('https://www.minskole.no/dvergsnes/seksjon/123?next=1',school,'4'),false);
 assert.equal(isSchoolSectionUrl('http://www.minskole.no/dvergsnes/seksjon/123',school,'4'),false);
 assert.equal(isSchoolSectionUrl('https://www.minskole.no/fagerholt/seksjon/999',getSchool('fagerholt'),'4'),false);
});
test('school+grade API never downloads section or PDF from another school, and caches separately',async()=>{
 const school=getSchool('dvergsnes');const second=getSchool('haanes');
 const firstSection='https://www.minskole.no/dvergsnes/seksjon/21672';
 const secondSection='https://www.minskole.no/haanes/seksjon/22362';
 const visited=[];
 const get=async url=>{
  visited.push(url);
  if(url===school.homepage||url===school.homepage+'/nettstedskart')return response(sourceFixtures.dvergsnes,url);
  if(url===second.homepage||url===second.homepage+'/nettstedskart')return response(sourceFixtures.haanes,url);
  if(url===firstSection||url===secondSection)return response(`<a href="${p}">Ukeplan uke 44</a>`,url);
  if(url===p)return response('%PDF-1.7 test document bytes',url);
  throw new Error('Unexpected source: '+url);
 };
 const fn=createPlanHandler({fetchImpl:get,now:fixedDate,parsePdfPages:async()=>[{items:[],height:750,width:500}]});
 const x=await (await fn(new Request('https://localhost/api/plan?school=dvergsnes&grade=1'))).json();
 assert.equal(x.schoolId,'dvergsnes');assert.equal(x.source,firstSection);
 const y=await (await fn(new Request('https://localhost/api/plan?school=haanes&grade=2'))).json();
 assert.equal(y.schoolId,'haanes');assert.equal(y.source,secondSection);
 assert.deepEqual(visited,[school.homepage,school.homepage+'/nettstedskart',firstSection,p,second.homepage,second.homepage+'/nettstedskart',secondSection,p]);
 const a=cacheKey({school:'dvergsnes',grade:'1',year:2026,week:44,hash:'ab'});
 const b=cacheKey({school:'fagerholt',grade:'1',year:2026,week:44,hash:'ab'});
 assert.notEqual(a,b);
 assert.notEqual(progressKey('dvergsnes','1',2026,44,'bag'),progressKey('haanes','1',2026,44,'bag'));
});
test('missing trinn does not guess sections or present fake PDF; unknown school is rejected without fetching',async()=>{
 const calls=[];
 const fn=createPlanHandler({fetchImpl:async url=>{calls.push(url);return response('<a href="/dvergsnes/seksjon/444">4. trinn</a>',url);},now:fixedDate});
 const missing=await (await fn(new Request('https://localhost/api/plan?school=dvergsnes&grade=6'))).json();
 assert.equal(missing.status,'unavailable');assert.equal(missing.pdf,null);
 assert.deepEqual(calls,[getSchool('dvergsnes').homepage,getSchool('dvergsnes').homepage+'/nettstedskart']);
 const invalid=await fn(new Request('https://localhost/api/plan?school=https://evil.test&grade=1'));
 assert.equal(invalid.status,400);assert.equal(calls.length,2);
});
test('legacy Fagerholt API bookmarks stay functional without school query',async()=>{
 const source=getSchool('fagerholt').grades['4'];
 const fn=createPlanHandler({fetchImpl:async url=>url===source?response(`<a href="${p}">Ukeplan uke 44</a>`,url):response('%PDF-1.7 test document bytes',url),
  parsePdfPages:async()=>[{items:[],height:750,width:500}],now:fixedDate});
 const data=await (await fn(new Request('https://localhost/api/plan?grade=4'))).json();
 assert.equal(data.schoolId,'fagerholt');assert.equal(data.source,source);
});
test('frontend selects school first and persists grade separately per school',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="school-gate"/);assert.match(html,/id="grade-gate"/);
 assert.ok(html.indexOf('id="school-gate"')<html.indexOf('id="grade-gate"'));
 assert.match(app,/schoolSelectionKey\(\)/);
 assert.match(app,/gradeSelectionKey\(state\.school\.id\)/);
 assert.match(app,/state\.school\?\.id!==schoolId/);
 assert.notEqual(gradeSelectionKey('dvergsnes'),gradeSelectionKey('fagerholt'));
});


test('Sjøstrand grouped classes from official site map are selectable without guessing a grade page',async()=>{
 const school=getSchool('sjostrand');
 const sitemap=`<a href="/sjostrand/seksjon/100">1. trinn</a>
  <a href="/sjostrand/seksjon/111">3A</a><a href="/sjostrand/seksjon/112">3B</a>
  <a href="/sjostrand/seksjon/113">4A</a><a href="/sjostrand/seksjon/114">4B</a>`;
 const links=discoverGradeSections(sitemap,school);
 assert.deepEqual(Object.keys(links),['1','3A','3B','4A','4B']);
 const fn=createGradesHandler({fetchImpl:async url=>response(url.endsWith('/nettstedskart')?sitemap:'<main>Velkommen</main>',url)});
 const data=await (await fn(new Request('https://localhost/api/grades?school=sjostrand'))).json();
 assert.deepEqual(data.grades.map(g=>g.code),['1','3A','3B','4A','4B']);
 assert.ok(data.grades.some(g=>g.label==='4. trinn – gruppe B'));
 const plan=createPlanHandler({now:fixedDate,
  fetchImpl:async url=>{
   if(url===school.homepage)return response('<main>No navigation</main>',url);
   if(url===school.homepage+'/nettstedskart')return response(sitemap,url);
   if(url===links['3A'])return response(`<a href="${p}">Ukeplan uke 44</a>`,url);
   if(url===p)return response('%PDF-1.7 test document',url);
   throw Error('Unexpected URL: '+url);
  },parsePdfPages:async()=>[{items:[],height:600,width:600}]});
 const result=await (await plan(new Request('https://localhost/api/plan?school=sjostrand&grade=3A'))).json();
 assert.equal(result.schoolId,'sjostrand');assert.equal(result.grade,'3A');assert.equal(result.source,links['3A']);
 assert.equal(result.pdf,p);
});

test('grade discovery endpoint fails safely for unknown school without network requests',async()=>{
 let calls=0;
 const fn=createGradesHandler({fetchImpl:async()=>{calls++;throw Error('should not fetch')}});
 assert.equal((await fn(new Request('https://localhost/api/grades?school=evil'))).status,400);
 assert.equal(calls,0);
});
