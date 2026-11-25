import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const name=process.env.QA_BROWSER||'chromium';
const engine={chromium,firefox,webkit}[name];
if(!engine)throw Error('Unknown engine '+name);
let browser,server;
before(async()=>{server=await startStaticServer();browser=await engine.launch({headless:true});});
after(async()=>{await browser?.close();await server?.close();});
test('Mobile child-card picker filters and survives rerenders ('+name+')',async()=>{
 const context=await browser.newContext({viewport:{width:390,height:780},serviceWorkers:'block'});
 try{
  const page=await context.newPage();
  await page.goto(server.baseURL+'/barn/',{waitUntil:'domcontentloaded'});
  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/family-overview-child-picker.css"></head>
  <body><main id="family-view" data-family-mobile-view="overview"><div id="family-overview-child-picker" hidden>
   <button id="family-overview-child-open" aria-haspopup="dialog" aria-controls="family-overview-child-dialog">Vis barnekort: Alle barn <span>⌄</span></button></div>
   <div id="family-cards">
    <article class="family-child" data-child-id="a"><div class="family-child-heading"><h3>Barn A</h3></div></article>
    <article class="family-child" data-child-id="b"><div class="family-child-heading"><h3>Barn B</h3></div></article>
   </div></main>
   <dialog id="family-overview-child-dialog"><button id="family-overview-child-close">Lukk</button><div id="family-overview-child-options"></div></dialog>
   </body></html>`,{waitUntil:'load'});
  await page.evaluate(()=>import('/family-overview-child-picker.mjs'));
  await page.locator('#family-overview-child-open').waitFor({state:'visible'});
  await page.locator('#family-overview-child-open').click();
  await page.locator('[data-overview-child="a"]').click();
  assert.equal(await page.locator('.family-child[data-child-id="b"]').isVisible(),false);
  assert.equal(await page.locator('.family-child[data-child-id="a"]').isVisible(),true);
  await page.evaluate(()=>{
   const holder=document.getElementById('family-cards');
   holder.innerHTML='<article class="family-child" data-child-id="a"><div class="family-child-heading"><h3>Barn A</h3></div></article><article class="family-child" data-child-id="b"><div class="family-child-heading"><h3>Barn B</h3></div></article>';
  });
  await page.waitForFunction(()=>document.querySelector('.family-child[data-child-id="b"]')?.classList.contains('family-overview-child-hidden'));
  await page.locator('#family-overview-child-open').click();
  await page.locator('[data-overview-child=""]').click();
  assert.equal(await page.locator('.family-child[data-child-id="b"]').isVisible(),true);
  const tap=await page.locator('#family-overview-child-open').evaluate(el=>el.getBoundingClientRect().height);
  assert.ok(tap>=43.5);
 }finally{await context.close();}
});
