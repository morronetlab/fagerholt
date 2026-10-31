import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWeeklyDigest,nextSundayDigestWeek} from '../lib/weekly-digest.mjs';
import {runWeeklyDigestDispatch,dispatchWindow,serviceConfigured,
 getPublicData} from '../lib/weekly-digest-dispatch.mjs';
import {digestAvailable} from '../netlify/functions/digest-config.mjs';

const now=()=>new Date('2026-11-01T17:45:00.000Z');
const source='https://www.kristiansand.kommune.no/navigasjon/barnehage-og-skole/skole-og-sfo/skoleruta/';
const pdf='https://www.minskole.no/DynamicContent/Documents/uke45.pdf';
const profile={school:'fagerholt',grade:'3',group:''};
const user='00000000-0000-4000-8000-000000000001';
const env={WEEKLY_DIGEST_SEND_ENABLED:'true',SUPABASE_URL:'https://qxejliyfgfeigvxsqupg.supabase.co',
 SUPABASE_SERVICE_ROLE_KEY:'s'.repeat(40),RESEND_API_KEY:'re_12345678901234567890123456789',
 EMAIL_FROM:'Skoleuka <noreply@example.com>',URL:'https://skoleuk.no'};
const cal={schoolId:'fagerholt',year:2026,week:45,sourceStatus:'snapshot',sourceUrl:source,
 schoolUrl:'https://www.minskole.no/fagerholt',checkedAt:'2026-10-30',
 events:[{date:'2026-11-06',schoolFree:true,sfoClosed:false,sfoStatus:'unknown',
  label:'Fridag (Sørlandsk lærerstevne)'}]};
const plan={schoolId:'fagerholt',grade:'3',year:2026,week:45,
 status:'ok',aiStatus:'ready',parser:'ai',pdf,days:{},
 notices:['Vaksine onsdag morgen.'],provenance:[{kind:'notice',sourceQuote:'Vaksine onsdag morgen.',
  sourcePage:2,day:null}],dayNotes:{},homework:[]};
function blob(){
 const db=new Map();
 return {db,async get(key){return db.get(key)||null;},
 async setJSON(key,val,{onlyIfNew=false}={}){
  if(onlyIfNew&&db.has(key))return{modified:false};
  db.set(key,val);return{modified:true};
 },async delete(key){db.delete(key);}};
}
test('Sunday digest produces next week with school-free and honest SFO uncertainty',()=>{
 const week=nextSundayDigestWeek(now());
 assert.deepEqual([week.year,week.week,week.today],[2026,45,'2026-11-02']);
 const result=buildWeeklyDigest({now:now(),profiles:[profile],plans:new Map(),
  calendars:new Map([['fagerholt',cal]]),health:{status:'unavailable',stale:true}});
 assert.match(result.subject,/uke 45/);
 assert.match(result.text,/6. november/);
 assert.match(result.text,/Fridag \(Sørlandsk lærerstevne\)/);
 assert.match(result.text,/SFO-status er ikke bekreftet/);
 assert.match(result.text,/reserveversjon/i);
 assert.match(result.text,/ikke nylig verifisert/);
 assert.match(result.text,/ikke alle ukeplaner var ferdigtolket/i);
 assert.doesNotMatch(result.text,/SFO er bekreftet stengt/);
});
test('Digest only uses verified source quote from PDF; invented AI paragraphs are excluded',()=>{
 const copied={...plan,notices:['Vaksine onsdag morgen.','Alle elever får gratis sykkel.']};
 const result=buildWeeklyDigest({now:now(),profiles:[profile],calendars:new Map(),
  plans:new Map([['fagerholt|3',copied]])});
 assert.match(result.text,/Vaksine onsdag morgen/);
 assert.match(result.text,/uke45\.pdf#page=2/);
 assert.doesNotMatch(result.text,/gratis sykkel/);
 assert.match(result.text,/Logg inn på skoleuk.no/);
});
test('Digest turns explicit source closure into SFO closed but does not assume on other days',()=>{
 const data={...cal,sourceStatus:'live',events:[{date:'2026-11-06',
  schoolFree:true,sfoStatus:'closed',label:'Fridag'}]};
 const result=buildWeeklyDigest({now:now(),profiles:[profile],
  calendars:new Map([['fagerholt',data]])});
 assert.match(result.text,/SFO er bekreftet stengt/);
});
test('Timezone-aware schedule works Sunday evenings in winter and summer only',()=>{
 assert.equal(dispatchWindow(now()),true);
 assert.equal(dispatchWindow(new Date('2026-06-14T17:20:00Z')),true);
 assert.equal(dispatchWindow(new Date('2026-11-01T08:00:00Z')),false);
 assert.equal(dispatchWindow(new Date('2026-11-02T17:45:00Z')),false);
 assert.equal(serviceConfigured(env),true);
 assert.equal(serviceConfigured({}),false);
 assert.equal(digestAvailable(env),true);
 assert.equal(digestAvailable({...env,WEEKLY_DIGEST_SEND_ENABLED:'false'}),false);
});
test('Dispatcher never sends without explicit activation and role credentials',async()=>{
 const off=await runWeeklyDigestDispatch({env:{},now,serviceFactory:()=>{throw Error('must not open');}});
 assert.equal(off.status,'disabled');assert.equal(off.sent,0);
 const outside=await runWeeklyDigestDispatch({env,now:()=>new Date('2026-11-02T17:45:00Z'),
  serviceFactory:()=>{throw Error('no Sunday job');},storeFactory:async()=>blob()});
 assert.equal(outside.status,'outside-window');
});
test('Confirmed opt-in sends one email per week, skips unconfirmed recipients, no address in logs or blob',async()=>{
 const db=blob(),sent=[];
 const service={subscribers:async()=>[{user_id:user},
  {user_id:'00000000-0000-4000-8000-000000000002'}],
 memberFamilies:async()=>[{family_id:'00000000-0000-4000-8000-000000000099'}],
 children:async()=>[profile].map(x=>({school_id:x.school,grade:x.grade,group_name:x.group})),
 user:async id=>({id,email:id===user?'parent@example.com':'unconfirmed@example.com',
  email_confirmed_at:id===user?'2026-10-30T10:00:00Z':null})};
 const args={env,now,serviceFactory:()=>service,storeFactory:async()=>db,
 loadSources:async()=>({municipal:cal,plan}),
 fetchImpl:async()=>({ok:true,json:async()=>({status:'verified',stale:false})}),
 send:async(mail)=>{sent.push(mail);return 'resend-p-123';}};
 const a=await runWeeklyDigestDispatch(args);
 assert.equal(a.sent,1);assert.equal(sent.length,1);
 assert.equal(sent[0].to,'parent@example.com');
 assert.equal(sent[0].idempotencyKey,'skoleuka-week-2026-45-'+user);
 assert.ok(!JSON.stringify([...db.db]).includes('parent@example.com'));
 const b=await runWeeklyDigestDispatch(args);
 assert.equal(b.sent,0);assert.equal(sent.length,1);
 assert.equal([...db.db.keys()].filter(k=>k.startsWith('sent/')).length,1);
});
test('Opted-in account with no family/children never receives a message',async()=>{
 const db=blob(),sent=[];
 const result=await runWeeklyDigestDispatch({env,now,storeFactory:async()=>db,
  serviceFactory:()=>({subscribers:async()=>[{user_id:user}],memberFamilies:async()=>[],
   user:async()=>{throw Error('should not read email');}}),
  send:async args=>{sent.push(args);return 'id';}});
 assert.equal(result.sent,0);assert.equal(sent.length,0);
});
test('Public data loader requests only an allowlisted school/grade from own origin',async()=>{
 const calls=[];
 const result=await getPublicData('https://skoleuk.no',profile,
  {year:2026,week:45},{fetchImpl:async url=>{
   calls.push(url);return {ok:true,json:async()=>url.includes('school-calendar')?cal:plan};
  }});
 assert.equal(result.municipal.sourceStatus,'snapshot');
 assert.equal(result.plan.grade,'3');
 assert.equal(calls.length,2);
 assert.ok(calls.every(url=>url.startsWith('https://skoleuk.no/api/')));
 assert.ok(calls.some(url=>url.includes('nextWeek=1')));
});
