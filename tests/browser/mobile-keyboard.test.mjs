/** Simulates keyboard resize events; real iOS/Android device verification remains necessary. */
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
async function openPage(t,width){
 const context=await browser.newContext({viewport:{width,height:800},locale:'nb-NO'});
 t.after(()=>context.close());
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  const fake=new EventTarget();
  fake.height=window.innerHeight;
  fake.width=window.innerWidth;
  fake.offsetTop=0;
  fake.offsetLeft=0;
  Object.defineProperty(window,'visualViewport',{value:fake,configurable:true});
  window.__testKeyboardViewport=fake;
 });
 await page.route('**/api/account-config',r=>r.fulfill({
  status:200,contentType:'application/json',body:'{"enabled":false}'
 }));
 await page.goto(server.baseURL+'/',{waitUntil:'load'});
 return {page,errors};
}
async function resizeKeyboard(page,height){
 await page.evaluate(h=>{
  const v=window.__testKeyboardViewport;
  v.height=h;
  v.dispatchEvent(new Event('resize'));
 },height);
}
test('Account modal shrinks to visible viewport; focused field remains reachable',async t=>{
 const {page,errors}=await openPage(t,390);
 await page.evaluate(()=>{
  const dialog=document.querySelector('#account-panel');
  if(!dialog.open)dialog.showModal();
  // Exercise the very bottom field of a long onboarding form.
  const spacer=document.createElement('div');
  spacer.style.height='950px';
  const field=document.createElement('input');
  field.type='email';field.id='keyboard-test-email';
  dialog.append(spacer,field);
  field.focus();
 });
 await resizeKeyboard(page,410);
 await page.waitForFunction(()=>document.body.dataset.mobileKeyboard==='open');
 await page.waitForFunction(()=>{
  const rect=document.querySelector('#keyboard-test-email').getBoundingClientRect();
  const v=window.__testKeyboardViewport;
  return rect.bottom<=v.offsetTop+v.height-10 && rect.top>=v.offsetTop;
 });
 const values=await page.evaluate(()=>{
  const dialog=document.querySelector('#account-panel');
  const style=getComputedStyle(dialog);
  return {maxHeight:parseFloat(style.maxHeight),top:parseFloat(style.top),
   fontSize:getComputedStyle(document.querySelector('#keyboard-test-email')).fontSize,
   scrollTop:dialog.scrollTop};
 });
 assert.ok(values.maxHeight<=400,JSON.stringify(values));
 assert.ok(values.top>=0&&values.top<40,JSON.stringify(values));
 assert.equal(values.fontSize,'16px');
 assert.ok(values.scrollTop>0,JSON.stringify(values));
 await page.evaluate(()=>document.querySelector('#keyboard-test-email').blur());
 await resizeKeyboard(page,800);
 await page.waitForFunction(()=>!document.body.dataset.mobileKeyboard);
 assert.deepEqual(errors,[]);
});
test('Inline family activity field remains reachable and page becomes scrollable',async t=>{
 const {page,errors}=await openPage(t,390);
 await page.locator('#landing-local-family').click();
 await page.locator('#family-view').waitFor({state:'visible'});
 await page.locator('[data-family-mobile-tab="activities"]').click();
 await page.locator('#family-activity-add').click();
 const field=page.locator('#family-activity-name');
 await field.focus();
 await resizeKeyboard(page,390);
 await page.waitForFunction(()=>document.body.dataset.mobileKeyboard==='open');
 await page.waitForFunction(()=>{
  const rect=document.querySelector('#family-activity-name').getBoundingClientRect();
  return rect.bottom<=window.__testKeyboardViewport.height-10;
 });
 assert.equal(await field.evaluate(el=>getComputedStyle(el).fontSize),'16px');
 const padding=await page.locator('#family-view').evaluate(el=>parseFloat(getComputedStyle(el).paddingBottom));
 assert.ok(padding>=100, 'Must leave room to scroll form actions above keyboard');
 assert.deepEqual(errors,[]);
});
test('Desktop layout stays unchanged even when visual viewport reports a short height',async t=>{
 const {page,errors}=await openPage(t,1280);
 await page.evaluate(()=>{
  const dialog=document.querySelector('#account-panel');
  dialog.showModal();
  const field=document.createElement('input');
  field.type='text';dialog.appendChild(field);field.focus();
 });
 await resizeKeyboard(page,410);
 assert.equal(await page.evaluate(()=>document.body.dataset.mobileKeyboard),undefined);
 assert.deepEqual(errors,[]);
});
