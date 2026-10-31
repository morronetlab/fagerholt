import test from 'node:test';
import assert from 'node:assert/strict';
import {activityOccurrences,activityScopeLabel,activityTimeLabel,
 familyActivityWeekDates,normalizeActivityDraft,validIsoDate} from '../public/shared/family-activities.mjs';
import {CloudAccount} from '../public/shared/cloud-account.mjs';
import {readFileSync} from 'node:fs';

const child='00000000-0000-4000-8000-000000000001';
const family='00000000-0000-4000-8000-000000000002';
const base={title:'Korpsøvelse',child_id:child,occurs_on:'2026-10-26',start_time:'17:00',
 end_time:'18:30',repeat_rule:'weekly',repeat_until:null,location:'Musikkrommet',
 responsible:'En foresatt',notes:'Ta med klarinett'};
const event=(overrides={})=>({id:'00000000-0000-4000-8000-000000000003',
 ...base,...overrides});

test('Validate one-off and recurring activities without silently changing family data',()=>{
 assert.deepEqual(normalizeActivityDraft(base,[child]),base);
 assert.equal(normalizeActivityDraft({...base,repeat_rule:'none',repeat_until:'2026-12-31'},[child]).repeat_until,null);
 assert.equal(normalizeActivityDraft({...base,child_id:''},[child]).child_id,null);
 assert.throws(()=>normalizeActivityDraft({...base,child_id:'other'},[child]),/barn fra/);
 assert.throws(()=>normalizeActivityDraft({...base,occurs_on:'2026-02-30'},[child]),/dato/);
 assert.throws(()=>normalizeActivityDraft({...base,repeat_until:'2026-10-25'},[child]),/Sluttdato/);
 assert.throws(()=>normalizeActivityDraft({...base,end_time:'16:00'},[child]),/etter start/);
 assert.throws(()=>normalizeActivityDraft({...base,title:'x'.repeat(121)},[child]),/maks/);
 assert.equal(validIsoDate('2028-02-29'),true);
 assert.equal(validIsoDate('2027-02-29'),false);
});
test('Weekly activity recurs across ISO weeks and year boundary, excluding before start and after end',()=>{
 const d=event({occurs_on:'2026-12-28',repeat_until:'2027-01-11'});
 assert.equal(activityOccurrences([d],2026,52).length,0);
 assert.deepEqual(activityOccurrences([d],2026,53).map(x=>x.date),['2026-12-28']);
 assert.deepEqual(activityOccurrences([d],2027,1).map(x=>x.date),['2027-01-04']);
 assert.deepEqual(activityOccurrences([d],2027,2).map(x=>x.date),['2027-01-11']);
 assert.equal(activityOccurrences([d],2027,3).length,0);
 assert.deepEqual(familyActivityWeekDates(2026,44),{start:'2026-10-26',end:'2026-11-01'});
});
test('One-time event is not duplicated into future weeks and week includes weekend',()=>{
 const p=event({occurs_on:'2026-11-01',repeat_rule:'none',repeat_until:null,start_time:null,end_time:null});
 assert.deepEqual(activityOccurrences([p],2026,44).map(x=>x.date),['2026-11-01']);
 assert.equal(activityOccurrences([p],2026,45).length,0);
});
test('Weekly local date stays on Monday across Norwegian DST, sorting by day and time',()=>{
 const repeat=event();
 const another=event({id:'00000000-0000-4000-8000-000000000004',occurs_on:'2026-11-02',start_time:'09:00',end_time:null});
 const results=activityOccurrences([repeat,another],2026,45);
 assert.deepEqual(results.map(x=>x.date),['2026-11-02','2026-11-02']);
 assert.equal(results[0].title,'Korpsøvelse');
 assert.deepEqual(results.map(x=>x.start_time),['09:00','17:00']);
 assert.equal(activityTimeLabel(repeat),'17:00–18:30');
 assert.equal(activityScopeLabel(repeat,[{id:child,name:'Barn A'}]),'Barn A');
 assert.equal(activityScopeLabel(event({child_id:null}),[]),'Hele familien');
});
test('Supabase activity reads are scoped to a week and family; writes use user JWT',async()=>{
 const calls=[],store={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
 const client=new CloudAccount({url:'https://example-demo.supabase.co',
  publishableKey:'sb_publishable_'+'a'.repeat(40)},{
  storage:store,fetcher:async(url,opts)=>{
   calls.push({url,opts});
   return {ok:true,status:200,json:async()=>
    opts.method==='POST'?[{id:'new-id'}]:opts.method==='PATCH'?[{id:'existing-id'}]:
    opts.method==='DELETE'?[{id:'existing-id'}]:[]};
  }});
 client.session={access_token:'parent-jwt',refresh_token:'refresh-jwt',
  expires_at:Math.floor(Date.now()/1000)+3600,user:{id:child}};
 assert.deepEqual(await client.activities(family,2026,44),[]);
 assert.equal(calls.length,2);
 for(const {url,opts} of calls){
  assert.match(url,/family_activities/);
  assert.match(url,/family_id=eq\.00000000-0000-4000-8000-000000000002/);
  assert.match(url,/occurs_on=lte\.2026-11-01/);
  assert.equal(opts.headers.Authorization,'Bearer parent-jwt');
  assert.ok(!JSON.stringify(opts.headers).includes('service_role'));
 }
 await client.createActivity(family,base);
 await client.updateActivity(family,'activity-id',{title:'Oppdatert'});
 await client.deleteActivity(family,'activity-id');
 assert.equal(calls[2].opts.method,'POST');
 assert.equal(JSON.parse(calls[2].opts.body).family_id,family);
 assert.equal(calls[3].opts.method,'PATCH');
 assert.equal(calls[4].opts.method,'DELETE');
 assert.ok(calls[3].url.includes('family_id=eq.'+family));
 assert.ok(calls[4].url.includes('family_id=eq.'+family));
});
test('Migration requires RLS and same-family child reference with no anonymous grants',()=>{
 const migration=readFileSync(new URL('../supabase/migrations/20261031_family_activities_v1.sql',import.meta.url),'utf8');
 assert.match(migration,/enable row level security/);
 assert.match(migration,/private\.parent_family_ids\(\)/);
 assert.match(migration,/foreign key \(child_id,family_id\) references public\.children\(id,family_id\)/);
 assert.match(migration,/revoke all on table public\.family_activities from public,anon,authenticated/);
 assert.match(migration,/created_by = \(select auth\.uid\(\)\)/);
 assert.match(migration,/grant update \(child_id,title/);
 assert.doesNotMatch(migration,/grant .* on table public\.family_activities to anon;/);
});
