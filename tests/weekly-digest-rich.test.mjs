import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWeeklyDigest} from '../lib/weekly-digest.mjs';
import {renderWeeklyDigestHtml} from '../lib/weekly-digest-html.mjs';
import {sendPlainEmail} from '../lib/mail-core.mjs';
import {runWeeklyDigestDispatch} from '../lib/weekly-digest-dispatch.mjs';

const date=()=>new Date('2026-11-01T17:45:00.000Z');
const profile={school:'fagerholt',grade:'3',group:''};
const pdf='https://www.minskole.no/DynamicContent/Documents/uke45.pdf';
const plan={schoolId:'fagerholt',grade:'3',year:2026,week:45,
 status:'ok',parser:'ai',aiStatus:'ready',pdf,
 sourceAudit:{status:'ok',sourceFacts:4},homework:[
  {subject:'Norsk',text:'Les side 24–27',dueDay:'Torsdag'},
  {subject:'Matematikk',text:'Gjør oppgave 3',dueDay:'Fredag'}],
 days:{Mandag:{bring:[{label:'Gymtøy'}],events:[]},
  Tirsdag:{bring:[{label:'Badetøy'}],events:[]}},everyday:[],
 notices:[],dayNotes:{},provenance:[]};
test('HTML contains distinct homework deadlines and equipment with mobile email table layout',()=>{
 const result=buildWeeklyDigest({now:date(),profiles:[profile],
  plans:new Map([['fagerholt|3',plan]])});
 assert.equal(result.missingPlans,0);
 assert.match(result.text,/Norsk: Les side 24/);
 assert.match(result.text,/Torsdag/);
 assert.match(result.text,/Gymtøy/);
 assert.match(result.html,/LEKSER OG FRISTER/);
 assert.match(result.html,/HUSK Å TA MED/);
 assert.match(result.html,/Matematikk/);
 assert.match(result.html,/Badetøy/);
 assert.match(result.html,/max-width:600px/);
 assert.match(result.html,/https:\/\/skoleuka\.no\//);
});
test('Escapes PDF-sourced HTML and never renders it as markup',()=>{
 const malicious={...plan,homework:[{subject:'Norsk',text:'Les <script>alert(1)</script>',dueDay:'Mandag'}]};
 const result=buildWeeklyDigest({now:date(),profiles:[profile],
  plans:new Map([['fagerholt|3',malicious]])});
 assert.doesNotMatch(result.html,/<script>/);
 assert.match(result.html,/&lt;script&gt;/);
});
test('Unverified plan is not mistaken for no homework',()=>{
 const result=buildWeeklyDigest({now:date(),profiles:[profile],
  plans:new Map([['fagerholt|3',{...plan,sourceAudit:{status:'attention',sourceFacts:1}}]])});
 assert.equal(result.missingPlans,1);
 assert.doesNotMatch(result.html,/Les side 24/);
 assert.match(result.html,/Ukeplanen er ikke klar/);
});
test('Mail API receives both HTML and plain text alternatives',async()=>{
 const env={RESEND_API_KEY:'re_123456789012345',EMAIL_FROM:'Skoleuka <varsler@skoleuka.no>'};
 let submitted;
 await sendPlainEmail({to:'parent@example.no',subject:'Test',text:'Plain',
  html:renderWeeklyDigestHtml({week:45,sections:[],municipal:[],missingPlans:0}),
  idempotencyKey:'digest-test-12345'},
  {env,fetchImpl:async(_url,opts)=>{submitted=JSON.parse(opts.body);return{ok:true,json:async()=>({id:'email_1'})}}});
 assert.match(submitted.html,/<!doctype html>/);
 assert.equal(submitted.text,'Plain');
});
test('Scheduled run defers incomplete source instead of emailing an empty week',async()=>{
 const sent=[],data=new Map(),user='00000000-0000-4000-8000-000000000001';
 const store={get:async k=>data.get(k)||null,setJSON:async(k,v,o={})=>{
   if(o.onlyIfNew&&data.has(k))return{modified:false};data.set(k,v);return{modified:true};
 },delete:async k=>{data.delete(k)}};
 const env={WEEKLY_DIGEST_SEND_ENABLED:'true',
  SUPABASE_URL:'https://project123.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'sb_secret_'+'a'.repeat(40),
  RESEND_API_KEY:'re_123456789012345',EMAIL_FROM:'Skoleuka <varsler@skoleuka.no>',
  URL:'https://skoleuka.no'};
 const result=await runWeeklyDigestDispatch({env,now:date,
  storeFactory:async()=>store,
  serviceFactory:()=>({subscribers:async()=>[{user_id:user}],
   memberFamilies:async()=>[{family_id:'00000000-0000-4000-8000-000000000002'}],
   user:async()=>({id:user,email:'parent@example.no',email_confirmed_at:'2026-10-30'}),
   children:async()=>[{school_id:'fagerholt',grade:'3',group_name:''}],
   isSubscribed:async()=>true}),
  loadSources:async()=>({municipal:null,plan:null}),
  fetchImpl:async()=>({ok:true,json:async()=>({status:'verified',stale:false})}),
  send:async x=>{sent.push(x);return'mail-id'}});
 assert.equal(result.sent,0);
 assert.equal(sent.length,0);
 assert.equal(data.has('sent/2026-45/'+user),false);
});
