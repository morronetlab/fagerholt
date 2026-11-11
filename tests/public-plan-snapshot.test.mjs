import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cacheablePublicPlan,readPublicPlanSnapshot,storePublicPlanSnapshot,
 planSnapshotKey,PUBLIC_PLAN_SNAPSHOT_TTL} from '../public/shared/public-plan-snapshot.mjs';

const verified={schoolId:'fagerholt',grade:'3',year:2026,week:46,
 status:'ok',parser:'ai',aiStatus:'ready',homeworkSourceVersion:3,
 feedbackSourceRepairVersion:2,pdf:'https://www.minskole.no/example.pdf',
 homework:[{text:'Les 15 minutter'}],notices:[],days:{Mandag:{events:[]}}};
function storage(){
 const values=new Map();
 return {values,getItem:key=>values.get(key)||null,setItem:(key,v)=>values.set(key,v)};
}
test('The family warm-start cache is scoped by public school, grade and week',()=>{
 const store=storage(),time=1770000000000;
 assert.equal(storePublicPlanSnapshot(store,verified,'fagerholt','3',2026,46,time),true);
 assert.deepEqual(readPublicPlanSnapshot(store,'fagerholt','3',2026,46,time+1000),verified);
 assert.equal(readPublicPlanSnapshot(store,'fagerholt','7',2026,46,time+1000),null);
 assert.equal(readPublicPlanSnapshot(store,'fagerholt','3',2026,47,time+1000),null);
 assert.equal(readPublicPlanSnapshot(store,'fagerholt','3',2026,46,time+PUBLIC_PLAN_SNAPSHOT_TTL),null);
 assert.equal(readPublicPlanSnapshot(store,'fagerholt','3',2026,46,time-1),null);
 assert.match(planSnapshotKey('fagerholt','3',2026,46),/^skoleuka\.public-plan/);
});
test('Only verified AI-ready public school plans can be cached',()=>{
 const store=storage(),changes=[
  {aiStatus:'processing'},{aiStatus:'failed'},{parser:'fallback'},{status:'partial'},
  {homeworkSourceVersion:2},{feedbackSourceRepairVersion:1},{year:2025},{week:47},
  {grade:'7'},{schoolId:'other'},{pdf:null},{homework:null},{notices:null}
 ];
 for(const change of changes){
  assert.equal(cacheablePublicPlan({...verified,...change},'fagerholt','3',2026,46),false);
  assert.equal(storePublicPlanSnapshot(store,{...verified,...change},'fagerholt','3',2026,46),false);
 }
});
test('Tampered, oversized and unavailable session storage are ignored safely',()=>{
 const store=storage(),key=planSnapshotKey('fagerholt','3',2026,46);
 store.values.set(key,'{bad-json');
 assert.equal(readPublicPlanSnapshot(store,'fagerholt','3',2026,46),null);
 store.values.set(key,'x'.repeat(320001));
 assert.equal(readPublicPlanSnapshot(store,'fagerholt','3',2026,46),null);
 assert.equal(readPublicPlanSnapshot({getItem(){throw Error('blocked');}},'fagerholt','3',2026,46),null);
 assert.equal(storePublicPlanSnapshot({setItem(){throw Error('blocked');}},verified,'fagerholt','3',2026,46),false);
});
test('No authenticated data or cloud progress APIs are written into cached snapshot code',()=>{
 const family=readFileSync(new URL('../public/family-ui.mjs',import.meta.url),'utf8');
 const helper=readFileSync(new URL('../public/shared/public-plan-snapshot.mjs',import.meta.url),'utf8');
 assert.match(family,/readPublicPlanSnapshot\(sessionStorage/);
 assert.match(family,/storePublicPlanSnapshot\(sessionStorage/);
 assert.match(family,/await fetchPair\(pair,sequence\)/);
 // Inspect executable code, not the privacy explanation in the header comment.
 const code=helper.slice(helper.indexOf('export const PUBLIC_PLAN_SNAPSHOT_PREFIX'));
 assert.doesNotMatch(code,/localStorage|accountId|childId|familyId|progress|access_token/);
});
test('Static assets revalidate and HTML stays fresh; no global API edge caching',()=>{
 const toml=readFileSync(new URL('../netlify.toml',import.meta.url),'utf8');
 for(const ext of ['css','js','mjs'])assert.match(toml,new RegExp('for = "\\/\\*\\.'+ext+'"'));
 assert.match(toml,/Cache-Control = "public, max-age=120, must-revalidate"/);
 assert.match(toml,/for = "\/index\.html"[\s\S]*?Cache-Control = "no-cache, must-revalidate"/);
 assert.doesNotMatch(toml,/for = "\/api\/\*"/);
});
