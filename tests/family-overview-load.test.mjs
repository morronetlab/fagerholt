import test from 'node:test';
import assert from 'node:assert/strict';
import {cacheableCalendar,readCalendarCache,storeCalendarCache,
 FAMILY_CALENDAR_CACHE_TTL,FAMILY_OVERVIEW_BATCH_MS,holdInitialHighlights,
 stableHighlightOrder,highlightIdentity} from '../public/shared/family-overview-load.mjs';
import {createSchoolCalendarHandler} from '../netlify/functions/school-calendar.mjs';

const calendar={schoolId:'fagerholt',year:2026,week:45,sourceStatus:'snapshot',
 events:[{date:'2026-11-06',label:'Fridag (Sørlandsk lærerstevne)',schoolFree:true}]};
function memoryStorage(){
 const entries=new Map();
 return {getItem:key=>entries.get(key)||null,setItem:(key,value)=>entries.set(key,value),entries};
}
test('Official reserve snapshot returns immediately without remote municipal fetch',async()=>{
 let fetches=0;
 const handler=createSchoolCalendarHandler({
  now:()=>new Date('2026-10-31T12:00:00Z'),
  fetchImpl:async()=>{fetches++;throw Error('Network must not be called');}
 });
 const response=await handler(new Request(
  'https://skoleuka.no/api/school-calendar?school=fagerholt&year=2026&week=45&mode=snapshot'));
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.sourceStatus,'snapshot');
 assert.ok(data.events.some(x=>x.date==='2026-11-06'&&x.schoolFree));
 assert.equal(fetches,0);
 assert.match(response.headers.get('cache-control'),/max-age/);
});
test('Public municipal cache is short-lived and isolated per week/school',()=>{
 const storage=memoryStorage(),at=Date.now();
 assert.equal(cacheableCalendar(calendar,'fagerholt',2026,45),true);
 assert.equal(storeCalendarCache(storage,calendar,'fagerholt',2026,45,at),true);
 assert.deepEqual(readCalendarCache(storage,'fagerholt',2026,45,at+3000),calendar);
 assert.equal(readCalendarCache(storage,'fagerholt',2026,44,at+3000),null);
 assert.equal(readCalendarCache(storage,'dvergsnes',2026,45,at+3000),null);
 assert.equal(readCalendarCache(storage,'fagerholt',2026,45,at+FAMILY_CALENDAR_CACHE_TTL),null);
 assert.equal(cacheableCalendar({...calendar,events:[{date:'false',schoolFree:true}]},
  'fagerholt',2026,45),false);
 assert.equal(cacheableCalendar({...calendar,sourceStatus:'unavailable'},
  'fagerholt',2026,45),false);
});
test('Initial reminders batch resolves together or by a strict deadline',()=>{
 const startedAt=1000;
 assert.equal(holdInitialHighlights({startedAt,now:1100,pendingPairs:2,pendingCalendars:1}),true);
 assert.equal(holdInitialHighlights({startedAt,now:1150,pendingPairs:0,pendingCalendars:1}),true);
 assert.equal(holdInitialHighlights({startedAt,now:1150,pendingPairs:0,pendingCalendars:0}),false);
 assert.equal(holdInitialHighlights({startedAt,now:startedAt+FAMILY_OVERVIEW_BATCH_MS,
  pendingPairs:1,pendingCalendars:1}),false);
 assert.equal(holdInitialHighlights({startedAt:0,pendingPairs:2}),false);
});
test('Late AI re-ranking cannot move existing reminders; new closures keep their priority',()=>{
 const item=(id,label)=>({id,kind:'notice',priority:2,label});
 const first=[item('a','Ta med pennal'),item('b','Husk tursekk')];
 const ids=first.map(highlightIdentity);
 const ranked=[first[1],first[0]];
 assert.deepEqual(stableHighlightOrder(ranked,ids).map(x=>x.id),['a','b']);
 const newClosure=item('c','Fredag: planleggingsdag – elevene har fri');
 assert.deepEqual(stableHighlightOrder([first[1],newClosure,first[0]],ids)
  .map(x=>x.id),['c','a','b']);
 assert.deepEqual(stableHighlightOrder(ranked,[]),ranked);
});
