import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const engineName=process.env.QA_BROWSER||'chromium';
const engine={chromium,firefox,webkit}[engineName];
if(!engine)throw Error('Bad engine '+engineName);
let browser,server;
before(async()=>{server=await startStaticServer();browser=await engine.launch({headless:true});});
after(async()=>{await browser?.close();await server?.close();});
test('Calendar child sheet and kind filter remain usable on mobile ('+engineName+')',async()=>{
 const ctx=await browser.newContext({viewport:{width:390,height:780},serviceWorkers:'block'});
 try{
  const page=await ctx.newPage();
  await page.goto(server.baseURL+'/barn/',{waitUntil:'domcontentloaded'});
  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/family-calendar-24.css"></head><body class="family-dashboard-active">
  <main id="family-view" data-family-mobile-view="calendar">
   <nav id="family-mobile-nav"><button data-family-mobile-tab="overview">Oversikt</button><button data-family-mobile-tab="calendar">Kalender</button><button data-family-mobile-tab="activities">Aktiviteter</button></nav>
   <section class="family-agenda">
    <button id="family-mobile-child-open" type="button" class="family-mobile-child-open">Alle barn <span aria-hidden="true">⌄</span></button>
    <select id="family-agenda-child"><option value="">Alle barn</option><option value="a">Ailin</option><option value="b">Maya</option></select>
    <div id="family-mobile-days"></div>
    <details id="family-mobile-calendar-options"><summary>Flere</summary><button data-family-mobile-range type="button">Vis uka</button><button data-family-mobile-weekend type="button" hidden>Helg</button></details>
    <p id="family-mobile-day-status"></p>
    <div id="family-mobile-kind-filter"><button type="button" data-family-kind="all">Alle</button><button type="button" data-family-kind="homework">Lekser</button><button type="button" data-family-kind="family">Aktiviteter</button></div>
    <p id="family-mobile-filter-empty" hidden></p>
    <button id="family-agenda-weekend-toggle" hidden aria-expanded="false">Vis helg</button>
    <div id="family-agenda-days">
     <section class="family-agenda-day today" data-date="2026-11-25"><h3>Onsdag 25. nov.</h3>
      <article class="family-agenda-item kind-homework">Matteprøve</article>
      <article class="family-agenda-item kind-family">Klarinett</article>
     </section>
     <section class="family-agenda-day" data-date="2026-11-26"><h3>Torsdag 26. nov.</h3></section>
    </div>
   </section>
   <details id="family-activity-manage"></details><dialog id="family-activity-dialog"></dialog>
  </main>
  <dialog id="family-mobile-child-dialog"><button id="family-mobile-child-close">Lukk</button><div id="family-mobile-child-options"></div></dialog>
  </body></html>`,{waitUntil:'load'});
  await page.evaluate(async()=>{const {initFamilyMobileUI}=await import('/family-mobile.mjs');initFamilyMobileUI().selectView('calendar');});
  assert.equal(await page.locator('#family-mobile-child-open').isVisible(),true);
  await page.locator('#family-mobile-child-open').click();
  assert.equal(await page.locator('#family-mobile-child-dialog').evaluate(x=>x.open),true);
  await page.locator('#family-mobile-child-options [data-child-id="b"]').click();
  assert.equal(await page.locator('#family-agenda-child').inputValue(),'b');
  assert.equal(await page.locator('#family-mobile-child-dialog').evaluate(x=>x.open),false);
  await page.locator('[data-family-kind="homework"]').click();
  assert.equal(await page.locator('.kind-family').evaluate(x=>x.classList.contains('family-mobile-kind-hidden')),true);
  assert.equal(await page.locator('.kind-homework').evaluate(x=>x.classList.contains('family-mobile-kind-hidden')),false);
  assert.equal(await page.locator('#family-mobile-day-status').innerText(),'Onsdag 25. nov. · 1 hendelse');
  await page.locator('[data-family-kind="family"]').click();
  assert.equal(await page.locator('.kind-homework').evaluate(x=>x.classList.contains('family-mobile-kind-hidden')),true);
  await page.locator('#family-mobile-child-open').click();
  await page.locator('#family-mobile-child-options [data-child-id=""]').click();
  assert.equal(await page.locator('#family-agenda-child').inputValue(),'');
  const size=await page.locator('.family-mobile-child-option').first().evaluate(el=>getComputedStyle(el).minHeight);
  assert.ok(parseFloat(size)>=58);
 }finally{await ctx.close();}
});
