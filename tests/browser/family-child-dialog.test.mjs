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
async function openPage(t,width,{keyboard=false}={}){
 const context=await browser.newContext({viewport:{width,height:800},locale:'nb-NO'});
 t.after(()=>context.close());
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 if(keyboard)await page.addInitScript(()=>{
  const viewport=new EventTarget();
  viewport.height=innerHeight;viewport.width=innerWidth;viewport.offsetTop=0;viewport.offsetLeft=0;
  Object.defineProperty(window,'visualViewport',{value:viewport,configurable:true});
  window.__testKeyboardViewport=viewport;
 });
 await page.route('**/api/account-config*',r=>r.fulfill({
  status:200,contentType:'application/json',body:'{"enabled":false}'
 }));
 await page.route('**/api/grades?**',r=>r.fulfill({
  status:200,contentType:'application/json',
  body:JSON.stringify({grades:[{code:'2'},{code:'5A'}]})
 }));
 await page.goto(server.baseURL+'/',{waitUntil:'load'});
 if(await page.locator('#landing-other-options').isVisible())
  await page.locator('#landing-other-options').click();
 await page.locator('#landing-local-family').click();
 const modal=page.locator('#family-child-dialog');
 await modal.waitFor({state:'visible'});
 return {page,modal,errors};
}
test('Add child is a real, accessible mobile modal with cancel and Escape',async t=>{
 const {page,modal,errors}=await openPage(t,390);
 assert.equal(await modal.evaluate(el=>el.open),true);
 assert.equal(await page.locator('#family-form').evaluate(el=>el.closest('dialog').id),'family-child-dialog');
 assert.equal(await page.evaluate(()=>document.body.classList.contains('account-modal-open')),true);
 assert.equal(await page.locator('#family-cancel').isVisible(),true);
 assert.notEqual(await page.evaluate(()=>document.activeElement.id),'family-name',
  'The keyboard should not open immediately on mobile');
 await page.locator('#family-name').fill('Ulagret barn');
 await page.locator('#family-cancel').click();
 await page.waitForFunction(()=>!document.body.classList.contains('account-modal-open'));
 assert.equal(await modal.evaluate(el=>el.open),false);
 assert.equal(await page.locator('#family-cards .family-child').count(),0);
 await page.locator('#family-empty-add').click();
 assert.equal(await page.locator('#family-name').inputValue(),'');
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.querySelector('#family-child-dialog').open);
 await page.waitForFunction(()=>!document.body.classList.contains('account-modal-open'));
 assert.equal(await page.evaluate(()=>document.body.classList.contains('account-modal-open')),false);
 assert.deepEqual(errors,[]);
});
for(const width of [390,1280]){
 test('Modal saves a child, closes and can reopen at '+width+'px',async t=>{
  const {page,modal,errors}=await openPage(t,width);
  await page.locator('#family-name').fill('Testbarn');
  await page.locator('#family-school').selectOption('sjostrand');
  await page.locator('#family-grade option[value="2"]').waitFor({state:'attached'});
  await page.locator('#family-grade').selectOption('2');
  await page.locator('#family-save').click();
  await page.locator('#family-cards .family-child').filter({hasText:'Testbarn'}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('#family-child-dialog').open);
  assert.equal(await page.locator('#family-cards .family-child').count(),1);
  // Reopen via the family heading and ensure the new form is empty.
  await page.locator(width<=700?'#family-mobile-add':'#family-add').click();
  assert.equal(await modal.evaluate(el=>el.open),true);
  assert.equal(await page.locator('#family-name').inputValue(),'');
  await page.locator('#family-cancel').click();
  assert.deepEqual(errors,[]);
 });
}
test('Editing child uses the same modal, preloads values and persists changes',async t=>{
 const {page,modal,errors}=await openPage(t,1280);
 await page.locator('#family-name').fill('Nora');
 await page.locator('#family-school').selectOption('sjostrand');
 await page.locator('#family-grade option[value="2"]').waitFor({state:'attached'});
 await page.locator('#family-grade').selectOption('2');
 await page.locator('#family-save').click();
 await page.locator('#family-cards .family-child').filter({hasText:'Nora'}).waitFor();
 await page.locator('#family-cards [data-family-edit]').first().click();
 await modal.waitFor({state:'visible'});
 assert.match(await page.locator('#family-form-title').textContent(),/Rediger/);
 assert.equal(await page.locator('#family-name').inputValue(),'Nora');
 assert.equal(await page.locator('#family-school').inputValue(),'sjostrand');
 await page.locator('#family-name').fill('Nora oppdatert');
 await page.locator('#family-save').click();
 await page.locator('#family-cards .family-child').filter({hasText:'Nora oppdatert'}).waitFor();
 assert.equal(await modal.evaluate(el=>el.open),false);
 assert.deepEqual(errors,[]);
});
test('Virtual iPhone keyboard keeps Add child, fields and Save in visible dialog',async t=>{
 const {page,modal,errors}=await openPage(t,390,{keyboard:true});
 await page.locator('#family-name').focus();
 await page.evaluate(()=>{const v=window.__testKeyboardViewport;v.height=405;v.dispatchEvent(new Event('resize'));});
 await page.waitForFunction(()=>document.body.dataset.mobileKeyboard==='open');
 assert.equal(await page.locator('#family-name').evaluate(el=>getComputedStyle(el).fontSize),'16px');
 await page.locator('#family-group').focus();
 await page.waitForFunction(()=>{
  const v=window.__testKeyboardViewport,dialog=document.querySelector('#family-child-dialog');
  const rect=document.querySelector('#family-group').getBoundingClientRect();
  const r=dialog.getBoundingClientRect();
  return rect.bottom<=v.height-75 && rect.top>=v.offsetTop && r.bottom<=v.height+1;
 },{timeout:4000});
 const measurements=await page.evaluate(()=>{
  const r=document.querySelector('#family-child-dialog').getBoundingClientRect();
  const save=document.querySelector('#family-save').getBoundingClientRect();
  const dialog=document.querySelector('#family-child-dialog');
  return {dialogHeight:r.height,saveTop:save.top,saveBottom:save.bottom,
   viewportHeight:window.__testKeyboardViewport.height,scrollTop:dialog.scrollTop};
 });
 assert.ok(measurements.dialogHeight<=390,JSON.stringify(measurements));
 assert.ok(measurements.saveBottom<=405,JSON.stringify(measurements));
 assert.ok(measurements.saveTop>=0,JSON.stringify(measurements));
 await page.locator('#family-group').blur();
 await page.evaluate(()=>{const v=window.__testKeyboardViewport;v.height=800;v.dispatchEvent(new Event('resize'));});
 await page.waitForFunction(()=>!document.body.dataset.mobileKeyboard);
 await page.locator('#family-cancel').click();
 assert.deepEqual(errors,[]);
});
