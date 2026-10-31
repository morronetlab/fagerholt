import test from 'node:test';
import assert from 'node:assert/strict';
import {needsCachedEvidenceRefresh,refreshCachedEvidence} from '../lib/plan-cache-evidence.mjs';
import {HOMEWORK_SOURCE_VERSION} from '../lib/homework-source-truth.mjs';
import {buildWeeklyDigest} from '../lib/weekly-digest.mjs';
import {runWeeklyDigestDispatch,partialDeliveryWindow} from '../lib/weekly-digest-dispatch.mjs';

const date=()=>new Date('2026-11-01T19:30:00Z'); // 20:30 Oslo (CET)
const who='00000000-0000-4000-8000-000000000001';
const family='00000000-0000-4000-8000-000000000002';
const profiles=[{school:'fagerholt',grade:'3',group:''},{school:'fagerholt',grade:'7',group:''}];
const plan={schoolId:'fagerholt',grade:'3',year:2026,week:45,
 parser:'ai',aiStatus:'ready',status:'ok',
 homeworkSourceVersion:HOMEWORK_SOURCE_VERSION,homeworkSourceVerified:false,
 homework:[{subject:'Norsk',text:'Les kapittel 4',dueDay:'Torsdag'}],
 days:{},notices:[],dayNotes:{},everyday:[],provenance:[],
 pdf:'https://www.minskole.no/DynamicContent/Documents/ukeplan-uke-45.pdf'};
const unpublished={schoolId:'fagerholt',grade:'7',year:2026,week:45,
 status:'unpublished',source:'https://www.minskole.no/fagerholt/seksjon/22640',pdf:null};
const pages=[{items:[{text:'Ukeplan for uke 45. Norsk leselekse: Les kapittel fire, mandag til torsdag. Matematikk gjør side 20. Engelsk: lær gloser og les høyt.'}]}];

test('Old verified AI cache without sourceAudit can be audited from original PDF without rerunning AI',()=>{
 assert.equal(needsCachedEvidenceRefresh(plan),true);
 const repaired=refreshCachedEvidence(plan,pages);
 assert.equal(repaired.changed,true);
 assert.equal(repaired.plan.sourceAudit.status,'ok');
 assert.equal(repaired.plan.sourceAudit.sourceFacts,0);
 assert.equal(repaired.plan.homeworkSourceVersion,HOMEWORK_SOURCE_VERSION);
 assert.equal(needsCachedEvidenceRefresh(repaired.plan),false);
 assert.equal(refreshCachedEvidence(plan,[]).changed,false);
});
test('No exceptional notices still means a successfully audited weekly plan',()=>{
 const audited={...plan,sourceAudit:{status:'ok',sourceFacts:0,missing:0,unsupported:0}};
 const digest=buildWeeklyDigest({profiles,now:date(),plans:new Map([
  ['fagerholt|3',audited],['fagerholt|7',unpublished]])});
 assert.equal(digest.readyPlans,1);
 assert.equal(digest.missingPlans,1);
 assert.match(digest.text,/Norsk: Les kapittel 4/);
 assert.match(digest.html,/LEKSER OG FRISTER/);
 assert.match(digest.html,/Ukeplanen er ikke publisert ennå/);
 assert.match(digest.html,/Se skolens trinnside/);
 assert.match(digest.html,/seksjon\/22640/);
});
function store(){
 const db=new Map();
 return {db,get:async key=>db.get(key)||null,
  setJSON:async(key,val,{onlyIfNew=false}={})=>{
   if(onlyIfNew&&db.has(key))return{modified:false};
   db.set(key,val);return{modified:true};
  },delete:async key=>{db.delete(key)}};
}
const env={WEEKLY_DIGEST_SEND_ENABLED:'true',SUPABASE_URL:'https://example123.supabase.co',
 SUPABASE_SERVICE_ROLE_KEY:'sb_secret_'+'a'.repeat(40),
 RESEND_API_KEY:'re_123456789012345',EMAIL_FROM:'Skoleuka <varsler@skoleuka.no>',
 URL:'https://skoleuka.no'};
const service={subscribers:async()=>[{user_id:who}],
 memberFamilies:async()=>[{family_id:family}],
 children:async()=>profiles.map(p=>({school_id:p.school,grade:p.grade,group_name:''})),
 user:async()=>({id:who,email:'parent@example.no',email_confirmed_at:'2026-10-31'}),
 isSubscribed:async()=>true};
test('Sunday waits for missing school PDF, then sends useful partial message at Oslo cutoff',async()=>{
 const db=store(),sent=[];
 let now=new Date('2026-11-01T18:30:00Z'); // 19:30 local
 const args={env,now:()=>now,storeFactory:async()=>db,serviceFactory:()=>service,
  loadSources:async(_origin,p)=>({municipal:null,plan:p.grade==='3'?
    {...plan,sourceAudit:{status:'ok',sourceFacts:0,missing:0,unsupported:0}}:unpublished}),
  fetchImpl:async()=>({ok:true,json:async()=>({status:'verified',stale:false})}),
  send:async msg=>{sent.push(msg);return 'resend-1'}};
 assert.equal(partialDeliveryWindow(now),false);
 assert.equal((await runWeeklyDigestDispatch(args)).sent,0);
 assert.equal(sent.length,0);
 now=date();
 assert.equal(partialDeliveryWindow(now),true);
 const result=await runWeeklyDigestDispatch(args);
 assert.equal(result.sent,1);
 assert.equal(sent.length,1);
 assert.match(sent[0].html,/Norsk/);
 assert.match(sent[0].html,/Ukeplanen er ikke publisert/);
 assert.equal((await runWeeklyDigestDispatch(args)).sent,0);
});
test('Sunday never sends completely empty digest, even at final window',async()=>{
 const sent=[];
 const result=await runWeeklyDigestDispatch({env,now:date,
  storeFactory:async()=>store(),serviceFactory:()=>service,
  loadSources:async()=>({municipal:null,plan:unpublished}),
  fetchImpl:async()=>({ok:true,json:async()=>({status:'verified',stale:false})}),
  send:async x=>{sent.push(x);return 'id'}});
 assert.equal(result.sent,0);
 assert.equal(sent.length,0);
});
