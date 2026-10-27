import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SITE, GRADES, choiceStorageKey} from '../public/site-config.mjs';
import handler from '../netlify/functions/plan.mjs';
import {CLASS_URLS, osloCalendar, analyzePdfPages} from '../lib/plan-core.mjs';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('white-label site supports exactly grades 1–7, each with its own official source',()=>{
 assert.deepEqual(GRADES,['1','2','3','4','5','6','7']);
 for(const grade of GRADES){
   assert.equal(CLASS_URLS[grade],SITE.grades[grade]);
   assert.match(SITE.grades[grade],/https:\/\/www\.minskole\.no\/fagerholt\/seksjon\/\d+/);
 }
 assert.equal(SITE.features.afterSchool,false);
 assert.equal(SITE.features.redGroupGrade3,false);
});
test('browser grade choice is scoped to school, persisted, and resettable',()=>{
 assert.equal(choiceStorageKey(),'ukeplan.fagerholt.selected-grade.v1');
 assert.match(app,/currentLocal\.set\(choiceStorageKey\(\),grade\)/);
 assert.match(app,/currentLocal\.remove\(choiceStorageKey\(\)\)/);
 assert.match(app,/if\(state\.grade\)\{restoreCache\(\);render\(\);refreshAll\(\)\}else render\(\)/);
 assert.match(html,/id="onboarding"/);
 assert.match(html,/id="grade-grid"/);
 assert.match(html,/id="reset-grade"/);
});
test('frontend only fetches the selected grade and has no family-specific references',()=>{
 assert.match(app,/if\(!state\.grade\|\|state\.fetching\)return/);
 assert.match(app,/loadPlan\(version,grade\)/);
 assert.match(app,/\/api\/plan\?grade=\$\{encodeURIComponent\(grade\)\}/);
 assert.doesNotMatch(app,/loadGrade\('3'|loadGrade\('7'|Nora|Smilla|Maya|Julie|rød gruppe/);
 assert.ok(html.indexOf('id="homework-section"')<html.indexOf('id="theme-section"'));
 assert.ok(html.indexOf('id="theme-section"')<html.indexOf('id="notices-details"'));
});
test('API rejects missing and unsupported grades without trying to fetch school page',async()=>{
 const orig=globalThis.fetch;
 let called=0;
 globalThis.fetch=async()=>{called++;throw new Error('Must not fetch')};
 try{
  for(const g of [null,'0','8','7;3']){
   const u='https://demo.netlify.app/api/plan'+(g===null?'':`?grade=${encodeURIComponent(g)}`);
   const r=await handler(new Request(u));
   assert.equal(r.status,400);
  }
  assert.equal(called,0);
 }finally{globalThis.fetch=orig}
});
test('API selects the correct official page for all grades and never shows an older week as current',async()=>{
 const orig=globalThis.fetch,used=[];
 const {week}=osloCalendar(),old=week===1?52:week-1;
 globalThis.fetch=async url=>{
  used.push(String(url));
  return new Response(`<h2>Ukeplan</h2><a href="/DynamicContent/Documents/ukeplan-uke-${old}.pdf">Uke ${old} PDF</a>`,{status:200,headers:{'content-type':'text/html'}});
 };
 try {
  for(const g of GRADES){
   const response=await handler(new Request(`https://demo.netlify.app/api/plan?grade=${g}`));
   const data=await response.json();
   assert.equal(response.status,200);
   assert.equal(data.grade,g);
   assert.equal(data.source,SITE.grades[g]);
   assert.equal(data.status,'unpublished');
   assert.equal(data.pdf,null);
  }
  assert.deepEqual(used,GRADES.map(g=>SITE.grades[g]));
 }finally{globalThis.fetch=orig}
});
test('grade three red group processing is opt-in rather than applied to every child',()=>{
 const pages=[{width:595,height:840,items:[{text:'Ukas tema: Vennskap',x:20,y:20,width:220}]}];
 const full=analyzePdfPages(pages,'3','https://www.minskole.no/demo.pdf',weekNow(),2026);
 assert.equal(full.group,undefined);
});
function weekNow(){return osloCalendar().week}
