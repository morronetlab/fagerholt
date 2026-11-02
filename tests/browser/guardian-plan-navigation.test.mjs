/** Guardian-only navigation and scoped progress in the real SPA with mocked school APIs. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';

const days=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
const fixed='2026-10-28T10:00:00Z';
let server,browser;
before(async()=>{server=await startStaticServer();browser=await chromium.launch({headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();await server?.close();});
const reply=(route,body)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
function plan(grade){
 const schoolDays=Object.fromEntries(days.map(day=>[day,{
  events:[{time:'08:30',title:grade==='2'?'Lesing for A':'Matte for B'}],
  bring:[{label:grade==='2'?'Turklær':'Gymtøy'}]}]));
 return {
  grade,week:44,year:2026,source:'https://www.minskole.no/sjostrand/',
  pdf:'https://www.minskole.no/sjostrand/uke44.pdf',status:'ok',parser:'ai',
  aiStatus:'ready',homeworkSourceVersion:3,
  days:schoolDays,dayNotes:{},everyday:[],attendance:[],
  homework:[{subject:'Norsk',text:grade==='2'?'Les for A':'Skriv for B',dueDay:'Torsdag'}],
  notices:[],learningGoals:[],subjects:[],vocabulary:[],specialContent:[]
 };
}
async function open(t,width){
 const context=await browser.newContext({viewport:{width,height:840},
  locale:'nb-NO',timezoneId:'Europe/Oslo'});
 t.after(()=>context.close());
 const page=await context.newPage();
 await page.addInitScript(iso=>{
  const Native=Date,stamp=new Native(iso).getTime();
  class FixedDate extends Native{
   constructor(...args){if(args.length)super(...args);else super(stamp);}
   static now(){return stamp;}
  }
  window.Date=FixedDate;
  localStorage.setItem('ukeplanen.family.v2',JSON.stringify({version:2,profiles:[
   {id:'nav-child-a',name:'Ailin',school:'sjostrand',grade:'2',group:''},
   {id:'nav-child-b',name:'Maya',school:'sjostrand',grade:'5A',group:''}
  ]}));
 },fixed);
 const errors=[],requests=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/account-config*',route=>reply(route,{enabled:false}));
 await page.route('**/api/plan?**',route=>{
  requests.push(new URL(route.request().url()).searchParams.get('grade'));
  return reply(route,plan(requests.at(-1)));
 });
 await page.route('**/api/school-calendar?**',route=>reply(route,{sourceStatus:'unavailable',events:[]}));
 await page.route('**/api/practical-priority?**',route=>reply(route,{items:[]}));
 await page.route('**/api/weather?**',route=>reply(route,{days:{},locationLabel:'Sjøstrand'}));
 await page.goto(server.baseURL+'/',{waitUntil:'domcontentloaded'});
 await page.locator('#family-cards .family-child').nth(1).waitFor();
 // Wait for both school plans to be fully cached before testing zero-fetch sibling switches.
 await page.waitForFunction(()=>document.querySelectorAll('#family-cards .family-child-progress').length===2);
 return {page,errors,requests};
}
for(const width of [390,1280]){
 test('Guardian switches siblings without leaving plan, losing day or mixing progress at '+width+'px',async t=>{
  const {page,errors,requests}=await open(t,width);
  const a=page.locator('#family-cards .family-child').first();
  await a.locator(width<700?'[data-family-compact-open]':'[data-family-open]').click();
  await page.locator('#homework-list').getByText('Les for A').waitFor();
  await page.locator('#guardian-plan-toolbar').waitFor({state:'visible'});
  const buttons=page.locator('#guardian-plan-profiles button');
  assert.equal(await buttons.count(),2);
  assert.equal(await buttons.first().getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.primary-nav').isVisible(),false);
  assert.equal(await page.locator('#guardian-plan-summary').isVisible(),true);
  await page.locator('[data-day="3"]').click();
  assert.equal(await page.locator('[data-day="3"]').getAttribute('aria-current'),'date');
  await page.locator('#homework-list input[type="checkbox"]').first().check();
  assert.match(await page.locator('#guardian-plan-homework-state').innerText(),/1 av 1/);
  const before=requests.length;
  const scroll=await page.evaluate(()=>{
   document.querySelector('#homework-title').scrollIntoView({block:'start'});
   return scrollY;
  });
  await buttons.nth(1).click();
  await page.locator('#homework-list').getByText('Skriv for B').waitFor();
  assert.equal(await page.locator('[data-day="3"]').getAttribute('aria-current'),'date');
  assert.equal(await buttons.nth(1).getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#homework-list input[type="checkbox"]').first().isChecked(),false);
  assert.ok((await page.evaluate(()=>scrollY))>=Math.max(0,scroll-200),
   'Switching sibling must not jump back to top');
  assert.equal(requests.length,before,'Ready cached sibling plans must not require new PDF requests');
  await buttons.first().click();
  await page.locator('#homework-list').getByText('Les for A').waitFor();
  assert.equal(await page.locator('#homework-list input[type="checkbox"]').first().isChecked(),true);
  assert.equal(await page.locator('[data-day="3"]').getAttribute('aria-current'),'date');
  await page.locator('[data-guardian-jump="notices"]').click();
  assert.equal(await page.locator('#notices-panel').evaluate(node=>node.open),true);
  await page.locator('#plan-back-family').click();
  await page.locator('#family-view').waitFor({state:'visible'});
  assert.equal(await page.locator('#guardian-plan-toolbar').isVisible(),false);
  assert.deepEqual(errors,[]);
 });
}
test('Public visitor keeps school wizard and no guardian toolbar',async t=>{
 const context=await browser.newContext({viewport:{width:390,height:840}});
 t.after(()=>context.close());
 const page=await context.newPage();
 await page.route('**/api/account-config*',route=>reply(route,{enabled:false}));
 await page.goto(server.baseURL+'/',{waitUntil:'domcontentloaded'});
 await page.locator('#welcome-view').waitFor({state:'visible'});
 assert.equal(await page.locator('#guardian-plan-toolbar').isVisible(),false);
 assert.equal(await page.locator('.primary-nav').isVisible(),true);
});
