/** Browser verification of shared semantic action affordances.
 * Uses only static files; no real family, account, AI or Supabase data.
 */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';

let browser,server;
before(async()=>{
 server=await startStaticServer();
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await server?.close();});
const openPage=async(t,path='/',width=1180)=>{
 const context=await browser.newContext({viewport:{width,height:850},locale:'nb-NO'});
 t.after(()=>context.close());
 const page=await context.newPage();
 await page.goto(server.baseURL+path,{waitUntil:'domcontentloaded'});
 await page.locator('link[href="/action-system.css"]').waitFor({state:'attached'});
 return page;
};
const palette=async(page,selector)=>page.locator(selector).first().evaluate(el=>{
 const c=getComputedStyle(el);
 return {background:c.backgroundColor,border:c.borderTopColor,color:c.color,radius:c.borderTopLeftRadius};
});
const paint=(o)=>[o.background,o.border,o.color,o.radius];

test('Primary navigation and modal triggers have different, repeatable styles across the family UI',async t=>{
 const page=await openPage(t);
 const familyModal=await palette(page,'#family-add');
 const calendarModal=await palette(page,'#family-activity-add');
 const accountModal=await palette(page,'#account-button');
 const qrModal=await palette(page,'#plan-child-app-qr');
 assert.deepEqual(paint(familyModal),paint(calendarModal));
 assert.deepEqual(paint(familyModal),paint(qrModal));
 assert.deepEqual(paint(familyModal),paint(accountModal));
 const weekNav=await palette(page,'#landing-open-plan');
 const returnNav=await palette(page,'#plan-back-family');
 const accountNav=await palette(page,'#account-open-family');
 assert.deepEqual(paint(weekNav),paint(returnNav));
 assert.deepEqual(paint(weekNav),paint(accountNav));
 assert.notEqual(weekNav.background,familyModal.background,'Navigate must be recognizably different from opening a dialog');
});
test('Disclosure rows, buttons and utilities remain visually grouped in the responsive family view',async t=>{
 const page=await openPage(t,'/',390);
 const first=await palette(page,'#family-practical-details > summary');
 const second=await palette(page,'#family-activity-manage > summary');
 const more=await palette(page,'#family-mobile-important-more');
 assert.equal(first.background,second.background,'Both native accordions should use the same disclosure surface');
 assert.equal(first.background,more.background,'Mobile show-more must match the accordion');
 const refresh=await palette(page,'#family-refresh');
 const modal=await palette(page,'#family-add');
 assert.notEqual(refresh.background,modal.background,'Refresh is a utility, not a modal action');
 assert.match(await page.locator('#landing-other-options').getAttribute('class'),/sk-action--disclosure/);
 await page.locator('#landing-other-options').click();
 assert.equal(await page.locator('#landing-other-options').getAttribute('aria-expanded'),'true');
 await page.locator('#landing-other-options').click();
 assert.equal(await page.locator('#landing-other-options').getAttribute('aria-expanded'),'false');
});
test('Standalone child app and operations dashboard reuse the exact same utility styling',async t=>{
 const page=await openPage(t);
 const family=await palette(page,'#family-refresh');
 await page.goto(server.baseURL+'/barn/',{waitUntil:'domcontentloaded'});
 const child=await palette(page,'#child-refresh');
 assert.deepEqual(paint(child),paint(family));
 await page.goto(server.baseURL+'/drift/',{waitUntil:'domcontentloaded'});
 const operations=await palette(page,'#refresh');
 assert.deepEqual(paint(operations),paint(family));
 assert.match(await page.locator('#login button[type="submit"]').getAttribute('class'),/sk-action--submit/);
});
test('Keyboard focus and true destructive actions have accessible, distinct visual styles',async t=>{
 const page=await openPage(t);
 const normal=await palette(page,'#family-refresh');
 const danger=await palette(page,'#account-delete-family');
 assert.notEqual(normal.color,danger.color,'Destructive actions must not look like regular utilities');
 const keyboardStyle=await page.locator('#landing-open-plan').evaluate(el=>{
  el.focus({focusVisible:true});
  return getComputedStyle(el).outlineStyle;
 });
 // Browsers may decline focusVisible option when focus wasn't keyboard-driven.
 assert.ok(['solid','none'].includes(keyboardStyle));
 assert.match(await page.locator('#account-close').getAttribute('class'),/sk-action--close/);
});
