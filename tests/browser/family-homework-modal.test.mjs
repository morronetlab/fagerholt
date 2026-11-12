import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';

const fixed='2026-11-12T09:00:00Z';
const days=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
const reply=(route,body)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
const plan={schoolId:'sjostrand',schoolName:'Sjøstrand',grade:'2',week:46,year:2026,
 status:'ok',parser:'ai',aiStatus:'ready',homeworkSourceVersion:3,feedbackSourceRepairVersion:2,
 pdf:'https://www.minskole.no/sjostrand/uke46.pdf',
 homework:[{subject:'Norsk',text:'Les 15 minutter',dueDay:'Torsdag'},
 {subject:'Matte',text:'Regn to oppgaver',dueDay:'Fredag'}],
 days:Object.fromEntries(days.map(day=>[day,{events:[],bring:[]}])),
 everyday:[],notices:[],dayNotes:{},learningGoals:[],subjects:[],vocabulary:[]};

for(const width of [390,1280]){
 test('Family homework modal filters and shares checkbox state at '+width+'px',async t=>{
  const server=await startStaticServer();
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  t.after(async()=>{await browser.close();await server.close();});
  const context=await browser.newContext({viewport:{width,height:850},
   locale:'nb-NO',timezoneId:'Europe/Oslo'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(iso=>{
   const Native=Date,at=new Native(iso).getTime();
   class FixedDate extends Native{
    constructor(...args){super(...(args.length?args:[at]));}
    static now(){return at;}
   }
   window.Date=FixedDate;
   localStorage.setItem('ukeplanen.family.v2',JSON.stringify({version:2,profiles:[
    {id:'modal-child-a',name:'Ailin',school:'sjostrand',grade:'2',group:''}
   ]}));
  },fixed);
  await page.route('**/api/account-config*',route=>reply(route,{enabled:false}));
  await page.route('**/api/plan?**',route=>reply(route,plan));
  await page.route('**/api/school-calendar?**',route=>reply(route,{sourceStatus:'unavailable',events:[]}));
  await page.route('**/api/practical-priority?**',route=>reply(route,{items:[]}));
  await page.route('**/api/weather?**',route=>reply(route,{days:{}}));
  await page.goto(server.baseURL+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#family-week-progress')?.textContent==='0 av 2 lekser fullført');
  await page.locator(width<700?'#family-homework-open-mobile':'#family-homework-open').click();
  const dialog=page.locator('#family-homework-dialog');
  assert.equal(await dialog.evaluate(x=>x.open),true);
  assert.equal(await dialog.locator('.family-homework-task').count(),2);
  await dialog.locator('input[data-modal-homework-child]').first().click();
  await dialog.locator('.family-homework-task').count().then(n=>assert.equal(n,1));
  assert.match(await page.locator('#family-week-progress').innerText(),/1 av 2/);
  await dialog.locator('[data-homework-filter="completed"]').click();
  assert.equal(await dialog.locator('.family-homework-task').count(),1);
  await page.keyboard.press('Escape');
  assert.equal(await dialog.evaluate(x=>x.open),false);
  assert.deepEqual(errors,[]);
 });
}
