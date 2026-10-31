/** Chromium checks for the installed child-only app; no real Supabase data. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
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
 homework:[{text:'Les en bok',subject:'Norsk',group:'Rød',dueDay:'Fredag'},
  {text:'Blå gruppes hemmelige lekse',subject:'Norsk',group:'Blå',dueDay:'Fredag'}],
 vocabulary:[],notices:[]};
async function open(t,query='',{redeem=true}={}){
 const context=await browser.newContext({viewport:{width:390,height:790},locale:'nb-NO',timezoneId:'Europe/Oslo'});
 t.after(()=>context.close());
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const D=Date,fixed=new D('2026-10-28T12:00:00Z');
  class MockDate extends D{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return +fixed;}}
  window.Date=MockDate;
 });
 const calls=[];
 await page.route('**/api/child-access**',route=>{
  const url=new URL(route.request().url());
  calls.push({method:route.request().method(),url:url.pathname+url.search,headers:route.request().headers(),body:route.request().postDataJSON?.()});
  const isRedeem=route.request().method()==='POST';
  const data=isRedeem?redeem?{session,expiresAt:'2027-01-01T00:00:00Z'}:
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
 return {page,calls,errors};
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
