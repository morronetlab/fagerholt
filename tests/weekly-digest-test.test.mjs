import test from 'node:test';
import assert from 'node:assert/strict';
import {createDigestTestHandler} from '../lib/weekly-digest-test.mjs';

const userId='00000000-0000-4000-8000-000000000001';
const familyId='00000000-0000-4000-8000-000000000002';
const user={id:userId,email:'parent@example.no',email_confirmed_at:'2026-10-30T10:00:00Z'};
const env={SUPABASE_URL:'https://testproject123.supabase.co',
 SUPABASE_SERVICE_ROLE_KEY:'sb_secret_'+'s'.repeat(40),
 SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test123456789012345678901234',
 RESEND_API_KEY:'re_12345678901234567890123',EMAIL_FROM:'Skoleuka <test@skoleuka.no>',
 WEEKLY_DIGEST_SEND_ENABLED:'true',URL:'https://ukeplanen.netlify.app'};
const when=()=>new Date('2026-10-31T09:40:00Z');
const req=(token='a'.repeat(50),opts={})=>new Request('https://www.skoleuka.no/api/digest-send-test',{
 method:opts.method||'POST',
 headers:{...token?{Authorization:'Bearer '+token}:{},Origin:opts.origin||'https://www.skoleuka.no'}
});
const data={schoolId:'fagerholt',year:2026,week:45,sourceStatus:'snapshot',
 sourceUrl:'https://www.kristiansand.kommune.no/navigasjon/barnehage-og-skole/skole-og-sfo/skoleruta/',
 events:[{date:'2026-11-06',schoolFree:true,sfoStatus:'unknown',
  label:'Fridag (Sørlandsk lærerstevne)'}]};
function storage(){
 const map=new Map();
 return {map,async get(k){return map.get(k)||null},
 async setJSON(k,v,{onlyIfNew=false}={}){
  if(onlyIfNew&&map.has(k))return{modified:false};
  map.set(k,v);return{modified:true};
 },async delete(k){map.delete(k)}};
}
function base({mail=[],store=storage(),authUser=user,subscribed=true,
 families=[{family_id:familyId}],children=[{school_id:'fagerholt',grade:'3',group_name:''}],
 sendImpl=async p=>{mail.push(p);return'provider-id-1'},now=when}={}){
 const service={
  isSubscribed:async()=>subscribed,
  memberFamilies:async()=>families,
  children:async()=>children
 };
 const handler=createDigestTestHandler({env,now,storeFactory:async()=>store,
  serviceFactory:()=>service,send:sendImpl,
  loadSources:async()=>({municipal:data,plan:null}),
  fetchImpl:async url=>{
   if(url.includes('/auth/v1/user'))return{ok:!!authUser,json:async()=>authUser};
   if(url.includes('/api/source-health'))return{ok:true,json:async()=>({status:'unavailable',stale:true})};
   throw Error('Unexpected fetch '+url);
  }
 });
 return {handler,mail,store,service};
}
test('Authenticated on-demand send accepts only POST and needs operational enablement',async()=>{
 const {handler}=base();
 const get=await handler(req(null,{method:'GET'}));
 assert.equal(get.status,405);
 const disabled=createDigestTestHandler({env:{...env,WEEKLY_DIGEST_SEND_ENABLED:'false'}});
 assert.equal((await disabled(req())).status,503);
 assert.equal((await handler(req(null))).status,401);
 assert.equal((await handler(req('a'.repeat(50),{origin:'https://evil.example'}))).status,403);
});
test('Only verified email and own active subscription can send; no arbitrary destination',async()=>{
 const unverified=base({authUser:{...user,email_confirmed_at:null}});
 assert.equal((await unverified.handler(req())).status,403);
 const unsubscribed=base({subscribed:false});
 assert.equal((await unsubscribed.handler(req())).status,403);
 assert.equal((await base({families:[]}).handler(req())).status,403);
 assert.equal((await base({children:[]}).handler(req())).status,403);
});
test('Saturday immediate preview goes to authenticated verified email with correct domain, one send per day',async()=>{
 const p=base();
 const first=await p.handler(req());
 assert.equal(first.status,202);
 assert.deepEqual(await first.json(),{status:'accepted',year:2026,week:45});
 assert.equal(p.mail.length,1);
 assert.equal(p.mail[0].to,'parent@example.no');
 assert.match(p.mail[0].subject,/^TEST – Skoleuka:/);
 assert.match(p.mail[0].text,/https:\/\/skoleuka\.no\//);
 assert.doesNotMatch(p.mail[0].text,/https:\/\/skoleuk\.no/);
 assert.match(p.mail[0].text,/SFO-status er ikke bekreftet/);
 assert.equal((await p.handler(req())).status,429);
 assert.equal(p.mail.length,1);
 assert.equal(JSON.stringify([...p.store.map]).includes('parent@example.no'),false);
});
test('Upgraded HTML can be tested once even when the previous template was sent today',async()=>{
 const store=storage(),mail=[];
 // Existing production marker from the old plain-text test of the same day.
 store.map.set('sent/test-mail/'+userId,{at:when().toISOString(),providerId:'previous'});
 const p=base({store,mail});
 const first=await p.handler(req());
 assert.equal(first.status,202);
 assert.equal(mail.length,1);
 assert.match(mail[0].html,/<!doctype html>/);
 assert.match(mail[0].idempotencyKey,/skoleuka-test-rich-html-v2-/);
 assert.notEqual(mail[0].idempotencyKey,'skoleuka-test-2026-10-31-'+userId);
 assert.equal((await p.handler(req())).status,429);
 assert.equal(mail.length,1);
 assert.equal(store.map.has('sent/test-mail/'+userId),true);
 assert.equal(store.map.has('sent/test-mail/rich-html-v2/'+userId),true);
});
test('Provider failure is an error and releases claim so user can retry',async()=>{
 const store=storage();let fails=0;
 const p=base({store,sendImpl:async()=>{fails++;throw Error('provider down')}});
 assert.equal((await p.handler(req())).status,503);
 assert.equal((await p.handler(req())).status,503);
 assert.equal(fails,2);
 assert.equal([...store.map.keys()].some(k=>k.startsWith('locks/')),false);
});
test('Invalid session cannot request delivery even with configured sender',async()=>{
 const {handler}=base({authUser:null});
 assert.equal((await handler(req())).status,401);
});
