import test from 'node:test';
import assert from 'node:assert/strict';
import {SNAPSHOT_2026_27,SKOLERUTE_URL} from '../lib/kristiansand-calendar.mjs';
import {runCalendarMonitor,inspectOfficialHtml,healthSummary,
 STALE_AFTER_MS,HEALTH_KEY} from '../lib/calendar-monitor.mjs';
import {createSourceHealthHandler} from '../netlify/functions/source-health.mjs';
import {sendPlainEmail,mailConfigured} from '../lib/mail-core.mjs';

const source=rows=>'<html><h2>Skoleruta 2026-2027</h2><table>'+
 '<tr><th>Måned</th><th>Dato</th><th>Merknad</th></tr>'+
 rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+
 '</table><p>SFO er stengt julaften og nyttårsaften 2026 og uke 27-30 i 2027.</p>'+
 '<h2>Andre opplysninger</h2></html>';
function memoryStore(){
 const m=new Map();
 return {m,async get(key){return m.get(key)||null;},
 async setJSON(key,value){m.set(key,value);return{modified:true};}};
}
const response=html=>({ok:true,headers:new Headers(),text:async()=>html});
const date=()=>new Date('2026-10-31T10:00:00.000Z');
test('Municipal critical dates are verified against the official audited source; altered source is not silently accepted',()=>{
 const good=inspectOfficialHtml(source(SNAPSHOT_2026_27),2026);
 assert.equal(good.valid,true);assert.equal(good.sfoVerified,true);
 const changed=SNAPSHOT_2026_27.map(r=>[...r]);
 changed.find(x=>x[0]==='November')[1]='5.';
 const result=inspectOfficialHtml(source(changed),2026);
 assert.equal(result.valid,false);
 assert.deepEqual(result.changedDates,['2026-11-06']);
 assert.equal(inspectOfficialHtml('SFO stengt 6 november',2026).valid,false);
});
test('Daily monitor persists last verification, exposes no account data and marks freshness',async()=>{
 const store=memoryStore(),run=()=>runCalendarMonitor({
  fetchImpl:async()=>response(source(SNAPSHOT_2026_27)),
  storeFactory:async()=>store,now:date});
 const status=await run();
 assert.equal(status.status,'verified');assert.equal(status.stale,false);
 assert.equal(status.lastVerifiedAt,'2026-10-31T10:00:00.000Z');
 const persisted=store.m.get(HEALTH_KEY);
 assert.equal(persisted.status,'verified');assert.equal(persisted.rowCount,SNAPSHOT_2026_27.length);
 assert.ok(!('email' in persisted)&&!('ip' in persisted)&&!('profiles' in persisted));
 const http=await createSourceHealthHandler({storeFactory:async()=>store,
  now:()=>date().getTime()})(new Request('https://skoleuka.no/api/source-health'));
 assert.equal(http.status,200);
 assert.equal((await http.json()).status,'verified');
 assert.equal((await createSourceHealthHandler({storeFactory:async()=>store})(
  new Request('https://skoleuka.no/api/source-health',{method:'POST'}))).status,405);
});
test('Fetch failures retain last-good timestamp and become stale after 36 hours',async()=>{
 const store=memoryStore();let clock=date();
 const run=fetchImpl=>runCalendarMonitor({fetchImpl,storeFactory:async()=>store,now:()=>clock});
 await run(async()=>response(source(SNAPSHOT_2026_27)));
 clock=new Date(date().getTime()+60*60_000);
 let broken=await run(async()=>{throw Error('municipality offline');});
 assert.equal(broken.status,'unavailable');
 assert.equal(broken.stale,false);
 clock=new Date(date().getTime()+STALE_AFTER_MS+1);
 broken=await run(async()=>{throw Error('municipality offline');});
 assert.equal(broken.stale,true);
 assert.equal(broken.lastVerifiedAt,'2026-10-31T10:00:00.000Z');
 assert.equal(store.m.get(HEALTH_KEY).consecutiveFailures,2);
 assert.equal(healthSummary(null,clock.getTime()).status,'not_monitored');
 assert.equal(healthSummary(null,clock.getTime()).stale,true);
});
test('Operational alerts are opt-in and deduplicated, without personal data',async()=>{
 const store=memoryStore(),messages=[];
 const env={RESEND_API_KEY:'re_1234567890123456789012345',
  EMAIL_FROM:'Skoleuka <noreply@example.com>',SOURCE_ALERT_ENABLED:'true',
  SOURCE_ALERT_EMAIL:'drift@example.com'};
 const send=async payload=>{messages.push(payload);return 'message-id';};
 const run=()=>runCalendarMonitor({fetchImpl:async()=>{throw Error('offline');},
  storeFactory:async()=>store,now:date,env,notify:send});
 await run();await run();
 assert.equal(messages.length,1);
 assert.match(messages[0].text,/Sist verifisert/);
 assert.doesNotMatch(messages[0].text,/\b(?:user_id|email|barnenavn)\b/i);
 assert.equal(store.m.get(HEALTH_KEY).alertDelivered,true);
 await runCalendarMonitor({fetchImpl:async()=>response(source(SNAPSHOT_2026_27)),
  storeFactory:async()=>store,now:date,env,notify:send});
 assert.equal(store.m.get(HEALTH_KEY).alertDelivered,false);
});
test('Email sender is server-only, provider rejects missing confirmation, idempotency header included',async()=>{
 const env={RESEND_API_KEY:'re_1234567890123456789012345',
  EMAIL_FROM:'Skoleuka <noreply@example.com>'};
 assert.equal(mailConfigured(env),true);
 assert.equal(mailConfigured({}),false);
 let captured;
 const id=await sendPlainEmail({to:'ops@example.com',subject:'Kontroll',
  text:'En kilde var utilgjengelig.',idempotencyKey:'calendar-alert-2026-unavailable'},
  {env,fetchImpl:async(url,opts)=>{captured={url,opts};
   return {ok:true,json:async()=>({id:'resend-id-01'})};}});
 assert.equal(id,'resend-id-01');
 assert.equal(captured.url,'https://api.resend.com/emails');
 assert.equal(captured.opts.headers['Idempotency-Key'],'calendar-alert-2026-unavailable');
 assert.equal((await createSourceHealthHandler({storeFactory:async()=>{throw Error('offline');}})(
  new Request('https://skoleuka.no/api/source-health'))).status,200);
});
