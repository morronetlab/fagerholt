import test from 'node:test';
import assert from 'node:assert/strict';
import {scopedPackingItems} from '../public/barn/child-learning.mjs';
import {packingFingerprint} from '../public/shared/packing-fingerprint.mjs';
import {profileSummary} from '../public/shared/family-core.mjs';

const profile={id:'00000000-0000-4000-8000-000000000022',name:'Barn',
 school:'fagerholt',grade:'3',group:'Rød'};
const calendar={year:2026,week:45,today:'2026-11-02',weekday:0,upcoming:false};
const plan={status:'ok',aiStatus:'ready',year:2026,week:45,homework:[],
 everyday:[{label:'Matboks',group:'Rød'}],
 days:{Mandag:{bring:[{label:'Gymklær',group:'Rød'},
 {label:'Svømmetøy',group:'Blå'}]},Tirsdag:{bring:[{label:'Drikkeflaske'}]}}};
const key=(item,day)=>packingFingerprint({school:profile.school,grade:profile.grade,
 year:calendar.year,week:calendar.week,day,item});
test('Child and guardian use identical keys for both everyday and specific-day equipment',()=>{
 const child=scopedPackingItems(plan,profile,'Mandag');
 const parent=profileSummary(profile,plan,calendar,()=>null,
  null,(p,item,cal,day)=>key(item,day)===key(child[0],'Mandag'));
 assert.deepEqual(child.map(x=>x.label),['Matboks','Gymklær']);
 assert.equal(parent.todayBag.length,2);
 assert.deepEqual(parent.todayBag.map(x=>x.checked),[true,false]);
 assert.equal(key(child[0],'Mandag'),key(plan.everyday[0],'Mandag'));
 assert.notEqual(key(child[0],'Mandag'),key(child[0],'Tirsdag'));
 assert.equal(scopedPackingItems(plan,profile,'Mandag').some(x=>x.label==='Svømmetøy'),false);
});
