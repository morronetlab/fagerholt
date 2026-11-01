import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
test('Overview DOM prioritizes important notices, next school day, then children',()=>{
 const important=html.indexOf('<section class="family-tomorrow family-important"');
 const next=html.indexOf('<section id="family-tomorrow-brief"');
 const children=html.indexOf('<section id="family-children"');
 assert.ok(important>=0&&important<next&&next<children);
});
let browser,server;
before(async()=>{server=await startStaticServer();browser=await chromium.launch({headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();await server?.close();});
for(const width of [390,1280]){
 test('Family tabs switch sections at '+width+'px',async t=>{
  const context=await browser.newContext({viewport:{width,height:900},locale:'nb-NO'});
  t.after(()=>context.close());
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/account-config',r=>r.fulfill({status:200,contentType:'application/json',body:'{"enabled":false}'}));
  await page.goto(server.baseURL+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#welcome-view').waitFor({state:'visible'});
  await page.locator('#landing-other-options').click();
  await page.locator('#landing-local-family').click();
  await page.locator('#family-view').waitFor({state:'visible'});
  const tabs=page.locator('#family-mobile-nav [data-family-mobile-tab]');
  assert.equal(await tabs.count(),3);
  assert.equal(await tabs.first().isVisible(),true);
  assert.equal(await page.locator('#family-children').isVisible(),true);
  assert.equal(await page.locator('#family-agenda-days').isVisible(),false);
  await tabs.nth(1).click();
  assert.equal(await tabs.nth(1).getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#family-children').isVisible(),false);
  assert.equal(await page.locator('.family-agenda').isVisible(),true);
  await tabs.nth(2).click();
  assert.equal(await tabs.nth(2).getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#family-children').isVisible(),false);
  assert.equal(await page.locator('.family-agenda').isVisible(),false);
  assert.equal(await page.locator('#family-activity-section').isVisible(),true);
  await tabs.first().click();
  assert.equal(await page.locator('#family-children').isVisible(),true);
  assert.equal(await page.locator('#family-activity-section').isVisible(),false);
  assert.deepEqual(errors,[]);
 });
}
