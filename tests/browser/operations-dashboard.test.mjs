import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';

let browser,server;
before(async()=>{server=await startStaticServer();
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();await server?.close();});
const secret='ops-dashboard-test-0123456789abcdef';
const response={
 checkedAt:'2026-11-01T13:00:00.000Z',totalSchools:2,
 observedGrades:2,attentionGrades:1,alertsAfterConsecutiveFailures:3,
 alertConfigured:false,
 calendar:{status:'verified',stale:false,lastVerifiedAt:'2026-11-01T08:00:00.000Z'},
 schools:[
  {id:'fagerholt',name:'Fagerholt skole',status:'attention',grades:[
   {grade:'3',status:'source_error',consecutiveFailures:3,
    lastCheckedAt:'2026-11-01T12:55:00.000Z',lastSourceOkAt:'2026-10-31T11:00:00.000Z',
    lastPdfFoundAt:'2026-10-31T11:00:00.000Z',lastAIReadyAt:null}]},
  {id:'sjostrand',name:'Sjøstrand skole',status:'not_monitored',grades:[]}
 ]
};
test('Private drift dashboard requires an in-memory token and displays only aggregate school status',async t=>{
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},locale:'nb-NO'});
  t.after(()=>context.close());
  const page=await context.newPage(),errors=[],called=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/operations-health',route=>{
   called.push(route.request().headers().authorization);
   if(called.at(-1)!=='Bearer '+secret)return route.fulfill({status:401,
    contentType:'application/json',body:'{"error":"Ingen tilgang"}'});
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
  });
  await page.goto(server.baseURL+'/drift/',{waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('#login').isVisible(),true);
  assert.equal(await page.locator('#dashboard').isVisible(),false);
  assert.equal(called.length,0,'No operational request without token');
  await page.locator('#ops-token').fill(secret);
  await page.locator('#credentials button[type="submit"]').click();
  await page.locator('#dashboard').waitFor({state:'visible'});
  assert.equal(await page.locator('#ops-token').inputValue(),'');
  assert.equal(await page.locator('#grades-count').innerText(),'2');
  assert.equal(await page.locator('#attention-count').innerText(),'1');
  assert.match(await page.locator('#calendar-status').innerText(),/verified/);
  assert.match(await page.locator('#alert-info').innerText(),/ikke konfigurert/);
  await page.getByText('Fagerholt skole').click();
  assert.match(await page.locator('#school-list').innerText(),/Feil på skolekilde/);
  await page.locator('#school-search').fill('Sjøstrand');
  assert.equal(await page.locator('#school-list .school').count(),1);
  assert.match(await page.locator('#school-list').innerText(),/Ikke kontrollert/);
  assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),[],
   'Administrator secret must never be persisted in browser storage');
  assert.equal(new URL(page.url()).searchParams.has('token'),false);
  await page.locator('#logout').click();
  assert.equal(await page.locator('#dashboard').isVisible(),false);
  assert.equal(await page.locator('#login').isVisible(),true);
  assert.deepEqual(errors,[]);
 }
});
