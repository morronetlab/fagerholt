import test from 'node:test';
import assert from 'node:assert/strict';
import {siteConfig} from '../public/site-config.mjs';
import {FAMILY_STORAGE_KEY,FAMILY_MAX_PROFILES,readFamily,familyDocument,validProfile,
 putProfile,childProgressKey,groupApplies,schoolDayIndices,profileSummary,familyHighlights} from '../public/shared/family-core.mjs';
import {dayDate} from '../public/shared/calendar.mjs';
import {practiceKey} from '../public/shared/word-practice-core.mjs';
const schools=siteConfig.schools;
const a={id:'child-abcd-1111',name:'Barn A',school:'fagerholt',grade:'3',group:'Rød gruppe'};
const b={id:'child-abcd-2222',name:'Barn B',school:'fagerholt',grade:'3',group:'Blå gruppe'};
const calendar={year:2026,week:44,today:dayDate(2026,44,3)};
const plan={year:2026,week:44,status:'ok',aiStatus:'ready',
 homework:[{subject:'Norsk',text:'Les boka',dueDay:'Fredag'},
  {subject:'Engelsk',text:'Lær glosene',dueDay:'Torsdag',group:'Rød gruppe'},
  {subject:'Norsk',text:'Les høyt daglig',repeatDays:['Mandag','Tirsdag','Onsdag','Torsdag','Fredag']}],
 everyday:[{label:'Pennal'}],
 days:{Fredag:{bring:[{label:'Gymtøy',group:'Rød gruppe'}]}},
 dayNotes:{Fredag:[{text:'Ta med tursekk.',group:'Rød gruppe'}]}
};
test('Family data is strictly local, validated, and deduplicates profiles',()=>{
 assert.equal(FAMILY_STORAGE_KEY,'ukeplanen.family.v2');
 const raw=familyDocument([a,b,a,{...a,id:'bad id'}, {...a,id:'child-33333',school:'fake'}]);
 assert.deepEqual(readFamily(raw,schools),[a,b]);
 assert.deepEqual(readFamily('{malformed',schools),[]);
 assert.deepEqual(readFamily(JSON.stringify({version:1,profiles:[a]}),schools),[]);
 assert.equal(validProfile({...a,name:' '},schools),null);
 assert.equal(validProfile({...a,grade:'11'},schools),null);
 assert.equal(validProfile({...a,school:'fake'},schools),null);
});
test('Adding/editing respects a six-child limit and never overwrites siblings',()=>{
 let list=putProfile([],a,schools);
 list=putProfile(list,b,schools);
 assert.equal(list.length,2);
 list=putProfile(list,{...a,name:'Barn A endret'},schools);
 assert.equal(list.length,2);
 assert.equal(list[1].name,'Barn B');
 list=Array.from({length:FAMILY_MAX_PROFILES},(_,i)=>({...a,id:'child-'+String(i+1).padStart(8,'0')}));
 assert.throws(()=>putProfile(list,{...a,id:'child-new-1234'},schools),/seks/);
});
test('Two children in same grade have separate checklist and vocabulary keys',()=>{
 const one=childProgressKey(a,2026,44,'homework');
 const two=childProgressKey(b,2026,44,'homework');
 assert.notEqual(one,two);
 assert.notEqual(childProgressKey(a,2026,44,'homework'),childProgressKey(a,2026,45,'homework'));
 const words=[{language:'en',word:'apple',translation:'eple'}],scope={school:a.school,grade:a.grade,year:2026,week:44};
 assert.notEqual(practiceKey({...scope,childId:a.id},'en',words),practiceKey({...scope,childId:b.id},'en',words));
 assert.notEqual(practiceKey(scope,'en',words),practiceKey({...scope,childId:a.id},'en',words));
});
test('Source-backed family view respects group and keeps weekly homework progress isolated',()=>{
 const checks=new Map();
 checks.set(childProgressKey(a,2026,44,'homework'),JSON.stringify({0:true}));
 const storage=k=>checks.get(k)||null;
 const first=profileSummary(a,plan,calendar,storage),second=profileSummary(b,plan,calendar,storage);
 assert.equal(first.ready,true);
 assert.equal(first.total,7); // 2 one-off + 5 repeat-days
 assert.equal(first.done,1);
 assert.equal(second.done,0);
 assert.equal(first.today.some(x=>x.subject==='Engelsk'),true);
 assert.equal(second.today.some(x=>x.subject==='Engelsk'),false);
 assert.equal(first.next.some(x=>x.subject==='Norsk'),true);
 assert.equal(first.bag.some(x=>x.label==='Gymtøy'),true);
 assert.equal(second.bag.some(x=>x.label==='Gymtøy'),false);
 assert.equal(first.notices.length,1);
 assert.equal(second.notices.length,0);
 assert.equal(groupApplies({group:'Rød/Blå gruppe'},a),true);
});
test('Next school day never fabricates next week from current-week PDFs',()=>{
 assert.deepEqual(schoolDayIndices(calendar),{today:3,next:4});
 const friday={...calendar,today:dayDate(2026,44,4)};
 assert.deepEqual(schoolDayIndices(friday),{today:4,next:null});
 const summaries=new Map([[a.id,profileSummary(a,plan,friday,()=>null)]]);
 assert.deepEqual(familyHighlights([a],summaries,friday),[]);
});
test('Absent and stale plans are labelled unavailable rather than imagined tasks',()=>{
 assert.equal(profileSummary(a,null,calendar).ready,false);
 assert.equal(profileSummary(a,{...plan,week:43},calendar).ready,false);
 assert.equal(profileSummary(a,{...plan,aiStatus:'processing'},calendar).ready,false);
});
