/** Integrated guardian/child journey in Chromium with a shared in-memory API.
 * This is NOT a physical Android/iOS install test or real email delivery test.
 * It exercises the actual UI, API contract and cross-device state transitions.
 */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';

let browser,server;
before(async()=>{server=await startStaticServer();browser=await chromium.launch({headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();await server?.close();});
const fixed='2026-10-28T12:00:00Z',familyId='00000000-0000-4000-8000-000000000011',
 familyPair='b'.repeat(64);
const ok=(body,status=200)=>({status,body});
const fixture=()=>{
 const state={family:null,members:new Set(),children:[],invitation:null,
  devices:new Map(),pairings:new Map(),homework:new Map(),packing:new Map(),activities:[],revoked:[]};
 const user=email=>email.startsWith('second')?'guardian-two':'guardian-one';
 const userOf=auth=>String(auth||'').includes('guardian-two')?'guardian-two':'guardian-one';
 function supabase({url,method='GET',headers={},body}){
  const u=new URL(url),path=u.pathname,params=u.searchParams;
  const owner=userOf(headers.Authorization||headers.authorization);
  const data=body?JSON.parse(body):{};
  if(path.endsWith('/auth/v1/otp'))return ok({});
  if(path.endsWith('/auth/v1/verify')){
   const id=user(data.email);
   return ok({access_token:'access-'+id,refresh_token:'refresh-'+id,expires_in:3600,
    user:{id,email:data.email}});
  }
  if(path.endsWith('/auth/v1/user'))return ok({id:owner,email:owner+'@example.no'});
  if(path.endsWith('/auth/v1/token'))return ok({access_token:'access-'+owner,
   refresh_token:'refresh-'+owner,expires_in:3600,user:{id:owner,email:owner+'@example.no'}});
  if(path.endsWith('/rest/v1/rpc/create_family')){
   state.family={id:familyId,name:data.p_name,created_by:owner};state.members.add(owner);
   return ok(familyId);
  }
  if(path.endsWith('/rest/v1/rpc/invite_guardian')){
   state.invitation={token:'d'.repeat(64),email:data.p_email,by:owner};
   return ok(state.invitation.token);
  }
  if(path.endsWith('/rest/v1/rpc/accept_guardian_invite')){
   if(data.p_token!==state.invitation?.token)return ok({message:'Ugyldig invitasjon'},403);
   state.members.add(owner);return ok(familyId);
  }
  if(path.endsWith('/rest/v1/families'))
   return ok(state.family&&state.members.has(owner)?[state.family]:[]);
  if(path.endsWith('/rest/v1/children')){
   if(!state.members.has(owner))return ok([],403);
   if(method==='POST'){
    const child={...data,id:'00000000-0000-4000-8000-0000000000'+String(20+state.children.length+1),
     created_at:new Date(fixed).toISOString()};
    state.children.push(child);return ok([child]);
   }
   return ok(state.children);
  }
  if(path.endsWith('/rest/v1/homework_progress')||path.endsWith('/rest/v1/packing_progress')){
   const isPacking=path.endsWith('/rest/v1/packing_progress');
   const m=isPacking?state.packing:state.homework;
   if(method==='POST'){
    m.set(data.child_id+'|'+data.task_key,{child_id:data.child_id,task_key:data.task_key,completed:data.completed});
    return ok([data]);
   }
   return ok([...m.values()].filter(x=>state.members.has(owner)));
  }
  if(path.endsWith('/rest/v1/family_activities')){
   if(method==='POST'){
    const row={...data,id:'activity-1',created_at:fixed,updated_at:fixed};
    state.activities.push(row);return ok([row]);
   }
   return ok(state.activities.filter(x=>x.family_id===familyId));
  }
  if(path.endsWith('/rest/v1/weekly_digest_subscriptions'))return ok([]);
  return ok({message:'Unexpected mocked route '+path},404);
 }
 function childAccess(request){
  const url=new URL(request.url()),method=request.method();
  const body=method==='POST'?request.postDataJSON()||{}:{};
  const action=method==='GET'?url.searchParams.get('action'):body.action;
  const auth=String(request.headers().authorization||'').replace(/^Bearer /,'');
  const childId=url.searchParams.get('childId')||body.childId;
  const session=[...state.devices.values()].find(d=>d.token===auth&&!d.revoked);
  if(['status','create','devices','revoke'].includes(action) && !auth.startsWith('access-'))
   return ok({error:'Foresatt må være innlogget'},401);
  if(action==='status'){
   const rows=[...state.devices.values()].filter(x=>x.childId===childId&&!x.revoked);
   return ok({status:rows.some(x=>x.installed)?'installed':rows.length?'activated':
    [...state.pairings.values()].some(x=>x.childId===childId&&!x.used)?'invited':'not_invited'});
  }
  if(action==='create'){
   state.pairings.set(familyPair,{childId,used:false});
   return ok({link:server.baseURL+'/barn/?pair='+familyPair,
    qr:'data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64'),
    expiresAt:'2026-11-28T15:00:00Z'});
  }
  if(action==='devices')return ok({devices:[...state.devices.values()]
   .filter(x=>x.childId===childId).map(x=>({id:x.id,created_at:fixed,
    revoked_at:x.revoked?fixed:null,installed_at:x.installed?fixed:null,
    expires_at:'2026-12-01T00:00:00Z'}))});
  if(action==='revoke'){
   const device=[...state.devices.values()].find(x=>x.id===body.deviceId&&x.childId===body.childId);
   if(!device)return ok({error:'Ukjent enhet'},404);
   device.revoked=true;state.revoked.push(device.id);return ok({revoked:true});
  }
  if(action==='redeem'){
   const pairing=state.pairings.get(body.token);
   if(!pairing||pairing.used)return ok({error:'Utløpt QR'},410);
   pairing.used=true;
   const token='a'.repeat(64);
   state.devices.set(token,{id:'device-1',token,childId:pairing.childId,revoked:false,installed:false});
   return ok({session:token,expiresAt:'2026-12-01T00:00:00Z'});
  }
  if(!session)return ok({error:'Enheten har ikke tilgang'},401);
  if(action==='mark-installed'){session.installed=true;return ok({installed:true});}
  if(action==='self-revoke'){session.revoked=true;state.revoked.push(session.id);return ok({revoked:true});}
  if(action==='child'){
   const c=state.children.find(x=>x.id===session.childId);
   return ok({child:{id:c.id,name:c.nickname,school:c.school_id,grade:c.grade,group:c.group_name},
    activities:state.activities,expiresAt:'2026-12-01T00:00:00Z'});
  }
  const map=action==='packing'||action==='set-packing'?state.packing:state.homework;
  if(action==='progress'||action==='packing')
   return ok({progress:[...map.values()].filter(x=>x.child_id===session.childId)
    .map(x=>({key:x.task_key,completed:x.completed}))});
  if(action==='set-progress'||action==='set-packing'){
   map.set(session.childId+'|'+body.taskKey,
    {child_id:session.childId,task_key:body.taskKey,completed:body.completed});
   return ok({key:body.taskKey,completed:body.completed});
  }
  return ok({error:'Unknown child action '+action},400);
 }
 const plans=grade=>({
  status:'ok',parser:'ai',aiStatus:'ready',homeworkSourceVersion:1,
  schoolId:'sjostrand',grade,year:2026,week:44,
  source:'https://www.minskole.no/sjostrand/seksjon/12345',
  pdf:'https://www.minskole.no/sjostrand/uke44.pdf',
  days:{Onsdag:{events:[{title:grade==='2'?'Bibliotek for 2. trinn':'Tur for 5A'}],
   bring:[{label:'Gymtøy'}]}},everyday:[],
  dayNotes:{Onsdag:[]},attendance:[],
  homework:[{subject:'Norsk',text:grade==='2'?'Les 10 minutter':'Skriv fem setninger',
   dueDay:'Onsdag'}],notices:[],vocabulary:[],learningGoals:[],subjects:[]
 });
 return {state,supabase,childAccess,plans};
};
async function openPage(t,backend,{width=390,child=false}={}){
 const context=await browser.newContext({viewport:{width,height:844},locale:'nb-NO',timezoneId:'Europe/Oslo'});
 t.after(()=>context.close());
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(iso=>{
  const OldDate=Date,now=new OldDate(iso).getTime();
  class FixedDate extends OldDate{
   constructor(...args){if(args.length)super(...args);else super(now);}
   static now(){return now;}
  }
  window.Date=FixedDate;
 },fixed);
 if(!child){
  await page.exposeFunction('__mockSupabase',args=>backend.supabase(args));
  await page.addInitScript(()=>{
   const original=window.fetch.bind(window);
   window.fetch=async(input,init={})=>{
    const url=typeof input==='string'?input:input.url;
    if(!url.startsWith('https://testprojectabc.supabase.co/'))return original(input,init);
    const r=await window.__mockSupabase({url,method:init.method||'GET',headers:init.headers||{},body:init.body});
    return new Response(JSON.stringify(r.body),{status:r.status,
     headers:{'Content-Type':'application/json'}});
   };
  });
  await page.route('**/api/account-config*',route=>route.fulfill({status:200,contentType:'application/json',
   body:JSON.stringify({enabled:true,url:'https://testprojectabc.supabase.co/',
    publishableKey:'sb_publishable_test_not_a_real_key'})}));
  await page.route('**/api/grades?**',route=>route.fulfill({status:200,
   contentType:'application/json',body:JSON.stringify({grades:[{code:'2'},{code:'5A'}]})}));
 }
 await page.route('**/api/child-access**',route=>{
  const result=backend.childAccess(route.request());
  return route.fulfill({status:result.status,contentType:'application/json',body:JSON.stringify(result.body)});
 });
 await page.route('**/api/plan?**',route=>{
  const grade=new URL(route.request().url()).searchParams.get('grade')||'2';
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(backend.plans(grade))});
 });
 await page.route('**/api/weather?**',route=>route.fulfill({status:200,
  contentType:'application/json',body:'{"days":{},"locationLabel":"Kristiansand"}'}));
 await page.route('**/api/school-calendar?**',route=>route.fulfill({status:200,
  contentType:'application/json',body:'{"sourceStatus":"unavailable","events":[]}'}));
 await page.goto(server.baseURL+(child?'/barn/':'/'),{waitUntil:'domcontentloaded'});
 return {page,errors};
}
async function login(page,email){
 await page.locator('#account-email').fill(email);
 await page.locator('#account-send-code').click();
 await page.locator('[data-account-screen="verify"]').waitFor({state:'visible'});
 await page.locator('#account-code').fill('123456');
 await page.locator('#account-verify').click();
}
test('Two guardians, two children: OTP, invite, QR, install, shared homework and revocation',async t=>{
 const backend=fixture();
 const a=await openPage(t,backend),parent=a.page;
 await parent.locator('#landing-create-family').click();
 await login(parent,'first@example.no');
 await parent.locator('#account-family-name').waitFor({state:'visible'});
 await parent.locator('#account-family-name').fill('Testfamilien');
 await parent.locator('#account-create').click();
 await parent.locator('[data-account-screen="children"]').waitFor({state:'visible'});
 for(const [name,grade] of [['Maya','2'],['Ailin','5A']]){
  await parent.locator('#onboard-child-name').fill(name);
  await parent.locator('#onboard-child-school').selectOption('sjostrand');
  await parent.locator('#onboard-child-grade option[value="'+grade+'"]').waitFor({state:'attached'});
  await parent.locator('#onboard-child-grade').selectOption(grade);
  await parent.locator('#onboard-child-save').click();
  await parent.locator('#onboard-children-list .onboard-child-item').filter({hasText:name}).waitFor();
 }
 await parent.locator('#onboard-children-next').click();
 await parent.locator('#onboard-dashboard').click();
 await parent.locator('#family-cards .family-child').nth(1).waitFor();
 assert.equal(backend.state.children.length,2);
 assert.equal(await parent.locator('.primary-nav').isVisible(),false);
 await parent.locator('#account-button').click();
 await parent.locator('#account-invite-email').fill('second@example.no');
 await parent.locator('#account-invite-submit').click();
 await parent.locator('#account-invite-result').waitFor({state:'visible'});
 const invite=await parent.locator('#account-invite-link').inputValue();
 assert.match(invite,/#invite=/);
 await parent.locator('#account-close').click();
 // A second guardian accepts the invitation rather than inheriting an
 // already-logged-in family. All API state is shared across browser contexts.
 const b=await openPage(t,backend,{width:1280}),second=b.page;
 await second.goto(invite,{waitUntil:'domcontentloaded'});
 // A hash-only navigation on an already-open page doesn't re-run bootstrap.
 // A real invitation is opened as a new document; emulate that explicitly.
 await second.reload({waitUntil:'domcontentloaded'});
 await second.locator('#account-button').click();
 await login(second,'second@example.no');
 await second.locator('#account-invite-accept').waitFor({state:'visible'});
 await second.locator('#account-invite-accept').click();
 await second.locator('#account-open-family').waitFor({state:'visible'});
 await second.locator('#account-open-family').click();
 await second.locator('#family-cards .family-child').nth(1).waitFor();
 assert.equal(await second.locator('#family-cards .family-child').count(),2);
 assert.equal(backend.state.members.size,2);
 // Parent invites the first child. The second child's QR must remain untouched.
 await parent.locator('#family-cards .family-child-qr').first().click();
 await parent.locator('#child-pair-link').waitFor({state:'visible'});
 const url=await parent.locator('#child-pair-link').inputValue();
 await parent.locator('#child-pair-close').click();
 const c=await openPage(t,backend,{child:true}),childPage=c.page;
 await childPage.goto(url,{waitUntil:'domcontentloaded'});
 await childPage.locator('#child-greeting').getByText('Hei, Maya!').waitFor();
 assert.equal(new URL(childPage.url()).searchParams.has('pair'),false);
 assert.match(await childPage.locator('#child-homework').innerText(),/Les 10 minutter/);
 assert.doesNotMatch(await childPage.locator('#child-homework').innerText(),/Skriv fem setninger/);
 await parent.reload({waitUntil:'domcontentloaded'});
 await parent.locator('#family-cards .family-child').nth(1).waitFor();
 assert.equal(await parent.locator('#family-cards [data-setup-status="activated"]').count(),1,
  'QR redemption must not be mistaken for installation');
 // Simulate the browser OS appinstalled event; standalone detection is also
 // separately exercised in child PWA tests.
 await childPage.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));
 await parent.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await parent.locator('#family-cards [data-setup-status="installed"]').first().waitFor();
 assert.equal(await parent.locator('#family-cards .family-child-qr').count(),1,
  'Child 2 still needs its own setup CTA');
 await childPage.locator('#child-homework input[type="checkbox"]').first().check();
 await parent.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await parent.locator('#family-cards .family-child').first().getByText(/1 av 1 ferdig/).waitFor();
 await second.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await second.locator('#family-cards .family-child').first()
  .locator('.family-child-progress b').getByText('1 / 1 fullført').waitFor();
 assert.ok(backend.state.homework.size>0);
 // Revocation is authoritative. The child's old token no longer reads data.
 await parent.locator('#family-mobile-admin-toggle').click();
 await parent.locator('#family-cards .family-child').first().locator('[data-family-more]').click();
 await parent.locator('#family-cards .family-child').first().locator('[data-family-pair]').click();
 await parent.locator('#child-pair-devices [data-child-revoke]').first().waitFor();
 parent.once('dialog',dialog=>dialog.accept());
 await parent.locator('#child-pair-devices [data-child-revoke]').first().click();
 await parent.locator('#child-pair-close').click();
 await parent.locator('#family-cards .family-child').first()
  .locator('.family-child-setup:not(.is-complete)').waitFor();
 assert.equal(await parent.locator('#family-cards .family-child').first()
  .locator('.family-child-qr').count(),1,
  'Revoked app access must restore the QR setup action even if a new QR is pending');
 await childPage.locator('#child-refresh').click();
 await childPage.locator('#child-setup').waitFor({state:'visible'});
 assert.equal(backend.state.revoked.length,1);
 assert.deepEqual(a.errors,[]);
 assert.deepEqual(b.errors,[]);
 assert.deepEqual(c.errors,[]);
});
