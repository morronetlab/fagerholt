/** Chromium checks for the installed child-only app; no real Supabase data. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {taskFingerprint} from '../../public/shared/task-fingerprint.mjs';
let browser,server;
before(async()=>{server=await startStaticServer();browser=await chromium.launch({headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();await server?.close();});
const session='a'.repeat(64),pair='b'.repeat(64),child='00000000-0000-4000-8000-000000000022';
const plan={status:'ok',parser:'ai',aiStatus:'ready',year:2026,week:44,
 source:'https://www.minskole.no/fagerholt/seksjon/22636',pdf:'https://www.minskole.no/plan.pdf',
 days:{Onsdag:{events:[
  {title:'Tur for rød gruppe',group:'Rød',time:'10:00'},
  {title:'Svømming for blå gruppe',group:'Blå',time:'11:00'}
 ],bring:[{label:'Tursekk',group:'Rød'},{label:'Svømmetøy',group:'Blå'}]}},
 everyday:[],dayNotes:{Onsdag:[{text:'Husk samtykke fra foresatt',group:'Rød'}]},
 attendance:[{day:'Onsdag',time:'08:45',group:'Rød',text:'Ved biblioteket'},
  {day:'Onsdag',time:'09:00',group:'Blå',text:'Ved gymsalen'}],
 homework:[{text:'Les en bok',subject:'Norsk',group:'Rød',dueDay:'Fredag'},
  {text:'Forklar hva et adjektiv er',subject:'Norsk',group:'Rød',dueDay:'Torsdag'},
  {text:'Blå gruppes hemmelige lekse',subject:'Norsk',group:'Blå',dueDay:'Fredag'}],
 vocabulary:[{category:'engelske gloser',text:'apple - eple; dog - hund'},
  {category:'norske øveord',text:'skole, sol'}],notices:[]};
async function open(t,query='',{redeem=true,sharedProgress=null,saveReject=false,readReject=false}={}){
 const context=await browser.newContext({viewport:{width:390,height:790},locale:'nb-NO',timezoneId:'Europe/Oslo'});
 t.after(()=>context.close());
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const D=Date,fixed=new D('2026-10-28T12:00:00Z');
  class MockDate extends D{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return +fixed;}}
  window.Date=MockDate;
 });
 const calls=[],progress=sharedProgress||new Map();
 await page.route('**/api/child-access**',route=>{
  const url=new URL(route.request().url());
  calls.push({method:route.request().method(),url:url.pathname+url.search,headers:route.request().headers(),body:route.request().postDataJSON?.()});
  const action=route.request().method()==='POST'?route.request().postDataJSON()?.action:null;
  const isRedeem=action==='redeem',isSelfRevoke=action==='self-revoke',
   isProgress=url.searchParams.get('action')==='progress',isSave=action==='set-progress';
  if(isProgress&&readReject)return route.fulfill({status:503,contentType:'application/json',
   body:JSON.stringify({error:'Midlertidig utilgjengelig'})});
  if(isProgress)return route.fulfill({status:200,contentType:'application/json',
   body:JSON.stringify({progress:[...progress].map(([key,completed])=>({key,completed}))})});
  if(isSave){
   if(saveReject)return route.fulfill({status:503,contentType:'application/json',
    body:JSON.stringify({error:'Lagringen mislyktes'})});
   const body=route.request().postDataJSON();
   assert.equal(route.request().headers().authorization,'Bearer '+session);
   assert.equal(body.childId,undefined,'QR client may not choose sibling ID');
   assert.equal(body.familyId,undefined,'QR client may not choose family ID');
   progress.set(body.taskKey,body.completed);
   return route.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({key:body.taskKey,completed:body.completed})});
  }
  const data=isSelfRevoke?{revoked:true}:isRedeem?redeem?{session,expiresAt:'2027-01-01T00:00:00Z'}:
    {error:'Denne QR-koden er utløpt.'}:
   {child:{id:child,name:'Barn A',school:'fagerholt',grade:'3',group:'Rød'},
    activities:[
     {id:'one',title:'Korpsøvelse',child_id:child,occurs_on:'2026-10-28',
      repeat_rule:'none',repeat_until:null,start_time:'17:00',location:'Musikkrommet'},
     {id:'two',title:'Felles middag',child_id:null,occurs_on:'2026-10-28',
      repeat_rule:'none',repeat_until:null,start_time:'18:30'},
     {id:'sibling',title:'Søskenaktivitet',child_id:'other-child',occurs_on:'2026-10-28',
      repeat_rule:'none',repeat_until:null,start_time:'19:00'}
    ],expiresAt:'2027-01-01T00:00:00Z'};
  return route.fulfill({status:isRedeem&&!redeem?410:200,contentType:'application/json',
   body:JSON.stringify(data)});
 });
 await page.route('**/api/plan?**',route=>{
  calls.push({method:'GET',url:new URL(route.request().url()).pathname+new URL(route.request().url()).search});
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(plan)});
 });
 await page.goto(server.baseURL+'/barn/index.html'+query,{waitUntil:'domcontentloaded'});
 return {page,calls,errors,progress};
}
test('One QR activates isolated child app and hides sibling content',async t=>{
 const {page,calls,errors}=await open(t,'?pair='+pair);
 await page.locator('#child-greeting').getByText('Hei, Barn A!').waitFor({state:'visible'});
 assert.equal(new URL(page.url()).searchParams.has('pair'),false,'Pairing token must leave URL immediately');
 assert.equal(await page.locator('#child-days button').count(),5);
 assert.match(await page.locator('#child-events').innerText(),/Tur for rød/);
 assert.doesNotMatch(await page.locator('#child-events').innerText(),/Svømming for blå/);
 assert.match(await page.locator('#child-bag').innerText(),/Tursekk/);
 assert.doesNotMatch(await page.locator('#child-bag').innerText(),/Svømmetøy/);
 assert.match(await page.locator('#child-notes').innerText(),/Husk samtykke/);
 assert.match(await page.locator('#child-homework').innerText(),/Les en bok/);
 assert.doesNotMatch(await page.locator('#child-homework').innerText(),/hemmelige lekse/);
 assert.match(await page.locator('#child-activities').innerText(),/Korpsøvelse/);
 assert.match(await page.locator('#child-activities').innerText(),/Felles middag/);
 assert.doesNotMatch(await page.locator('#child-activities').innerText(),/Søskenaktivitet/);
 assert.equal(await page.locator('#family-toggle').count(),0);
 assert.equal(await page.locator('#account-button').count(),0);
 assert.equal(await page.locator('#change-school').count(),0);
 assert.equal(await page.locator('#child-install-box').isVisible(),true);
 assert.match(await page.locator('#child-source').innerText(),/Se originalen/);
 assert.ok(calls.some(c=>c.method==='POST'&&c.url==='/api/child-access'));
 assert.ok(calls.some(c=>c.url.includes('action=child')&&c.headers.authorization==='Bearer '+session));
 assert.deepEqual(errors,[]);
});
test('Child session persists after reload without rescanning QR, and can be removed',async t=>{
 const {page,calls,errors}=await open(t,'?pair='+pair);
 await page.locator('#child-greeting').getByText('Hei, Barn A!').waitFor();
 const created=calls.filter(x=>x.method==='POST').length;
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#child-greeting').getByText('Hei, Barn A!').waitFor();
 assert.equal(calls.filter(x=>x.method==='POST').length,created,'QR cannot be redeemed twice');
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#child-remove').click();
 await page.locator('#child-setup').waitFor({state:'visible'});
 assert.ok(calls.some(x=>x.body?.action==='self-revoke'),
  'Removing the child app must revoke the device capability on the server');
 assert.equal(await page.evaluate(()=>localStorage.getItem('skoleuka.child.device.v1')),null);
 assert.deepEqual(errors,[]);
});
test('Unpaired or expired QR never presents someone else’s profile',async t=>{
 const one=await open(t,'');
 await one.page.locator('#child-setup').waitFor({state:'visible'});
 assert.equal(await one.page.locator('#child-ready').isVisible(),false);
 const two=await open(t,'?pair='+pair,{redeem:false});
 await two.page.locator('#child-setup').waitFor({state:'visible'});
 await two.page.getByText(/utløpt/).waitFor();
 assert.equal(await two.page.locator('#child-ready').isVisible(),false);
 assert.deepEqual(one.errors,[]);
 assert.deepEqual(two.errors,[]);
});

test('Child sees groups and deadlines; packing is local while homework syncs with family progress',async t=>{
 const {page,errors,progress}=await open(t,'?pair='+pair);
 await page.locator('#child-greeting').getByText('Hei, Barn A!').waitFor({state:'visible'});
 assert.match(await page.locator('#child-events').innerText(),/Rød/);
 assert.match(await page.locator('#child-attendance').innerText(),/08:45/);
 assert.match(await page.locator('#child-attendance').innerText(),/biblioteket/);
 assert.equal(await page.locator('#child-other-groups').evaluate(el=>el.open),false);
 await page.locator('#child-other-groups > summary').click();
 assert.match(await page.locator('#child-other-events').innerText(),/Svømming for blå/);
 assert.match(await page.locator('#child-other-events').innerText(),/Blå/);
 assert.match(await page.locator('#child-homework').innerText(),/Til fredag/);
 assert.match(await page.locator('#child-homework').innerText(),/Til torsdag/);
 assert.match(await page.locator('#child-homework-progress').innerText(),/0 av 2/);
 assert.equal(await page.locator('#child-bag input[type=checkbox]').count(),1);
 await page.locator('#child-bag input[type=checkbox]').check();
 await page.locator('#child-homework input[data-child-homework="1"]').check();
 await page.locator('#child-homework-sync').getByText(/deles med foresatte/).waitFor();
 const fingerprint=taskFingerprint({school:'fagerholt',grade:'3',year:2026,week:44,
  task:plan.homework[1]});
 assert.equal(progress.get(fingerprint),true,'Guardian cloud progress should have the same task key');
 assert.match(await page.locator('#child-bag-progress').innerText(),/1 av 1/);
 assert.match(await page.locator('#child-homework-progress').innerText(),/1 av 2/);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#child-greeting').getByText('Hei, Barn A!').waitFor();
 assert.equal(await page.locator('#child-bag input[type=checkbox]').isChecked(),true);
 assert.equal(await page.locator('#child-homework input[data-child-homework="1"]').isChecked(),true);
 assert.match(await page.locator('#child-bag-progress').innerText(),/1 av 1/);
 assert.deepEqual(errors,[]);
});
test('Child may ask for a hint without exposing child identity or device bearer to homework AI',async t=>{
 const {page,errors}=await open(t,'?pair='+pair);
 const requests=[];
 await page.route('**/api/homework-helper',route=>{
  requests.push({headers:route.request().headers(),payload:route.request().postDataJSON()});
  return route.fulfill({status:200,contentType:'application/json',
   body:JSON.stringify({help:'Adjektiv beskriver ting og personer. Prøv å finne et eksempel.'})});
 });
 await page.locator('#child-homework [data-child-help-task="1"]').waitFor({state:'visible'});
 assert.equal(await page.locator('#child-homework [data-child-help-task="0"]').count(),0,
  'Reading-only tasks should not display the AI help button');
 await page.locator('#child-homework [data-child-help-task="1"]').click();
 await page.locator('#child-helper').waitFor({state:'visible'});
 await page.locator('[data-child-help="hint"]').click();
 await page.locator('#child-helper-result').getByText(/Adjektiv beskriver/).waitFor();
 assert.equal(requests.length,1);
 assert.equal(requests[0].payload.mode,'hint');
 assert.deepEqual(Object.keys(requests[0].payload).sort(),['grade','mode','subject','text']);
 assert.equal(requests[0].headers.authorization,undefined);
 assert.doesNotMatch(JSON.stringify(requests),/Barn A|skoleuka.child.device|Bearer/);
 await page.locator('#child-helper-close').click();
 assert.equal(await page.locator('#child-helper').isVisible(),false);
 assert.deepEqual(errors,[]);
});
test('Child can complete the actual PDF-grounded English quiz and Norwegian word exercise',async t=>{
 const {page,errors}=await open(t,'?pair='+pair);
 await page.locator('#child-greeting').getByText('Hei, Barn A!').waitFor();
 assert.equal(await page.locator('#child-quiz-section').isVisible(),true);
 await page.locator('[data-child-quiz-language="en"]').click();
 await page.locator('#child-quiz-game').waitFor({state:'visible'});
 assert.match(await page.locator('#child-quiz-question').innerText(),/apple/);
 await page.locator('#child-quiz-answer').fill('eple');
 await page.locator('#child-quiz-form button[type=submit]').click();
 assert.match(await page.locator('#child-quiz-feedback').innerText(),/Riktig/);
 await page.locator('#child-quiz-pause').click();
 await page.locator('[data-child-quiz-language="nb"]').click();
 assert.match(await page.locator('#child-quiz-question').innerText(),/Se ordet kort/);
 await page.locator('#child-quiz-peek').click();
 assert.equal(await page.locator('#child-quiz-preview').isVisible(),true);
 assert.deepEqual(errors,[]);
});
