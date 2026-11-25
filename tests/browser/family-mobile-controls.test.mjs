/** Regression for compact family dashboard controls at real mobile widths.
 * Standalone HTML fixtures deliberately avoid Supabase and account data.
 */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {startStaticServer} from './static-server.mjs';

const engineName=process.env.QA_BROWSER||'chromium';
const browserType={chromium,firefox,webkit}[engineName];
if(!browserType)throw Error('Unsupported QA_BROWSER: '+engineName);
let browser,server;
before(async()=>{
 server=await startStaticServer();
 browser=await browserType.launch({headless:true});
});
after(async()=>{await browser?.close();await server?.close();});

for(const width of [320,390,700]){
 test('Family mobile controls meet 44px target at '+width+'px in '+engineName,async()=>{
  const context=await browser.newContext({viewport:{width,height:800}});
  try{
   const page=await context.newPage();
   await page.goto(server.baseURL+'/barn/',{waitUntil:'domcontentloaded'});
   await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="/family-mobile.css">
    <link rel="stylesheet" href="/family-mobile-polish.css">
    </head><body class="family-dashboard-active family-cloud-active">
    <main id="family-view" data-family-mobile-view="overview">
      <nav class="family-mobile-nav"><button>Oversikt</button></nav>
      <section id="family-children">
        <div class="family-toolbar">
          <div><h2>Barna mine og ukens aktiviteter</h2></div>
          <div class="family-toolbar-actions">
            <button id="family-mobile-add">Legg til barn</button>
            <button id="family-mobile-admin-toggle" aria-label="Administrer">⚙</button>
          </div>
        </div>
        <div class="family-child"><div class="family-child-actions">
          <button data-family-open>Åpne</button>
          <button class="family-mobile-more">Mer</button>
        </div></div>
      </section>
    </main></body></html>`,{waitUntil:'load'});
   const measurements=await page.evaluate(()=>{
    const selectors=['.family-mobile-nav button','#family-mobile-add',
     '#family-mobile-admin-toggle','[data-family-open]','.family-mobile-more'];
    return {
     width:document.documentElement.clientWidth,
     scrollWidth:document.documentElement.scrollWidth,
     controls:selectors.map(selector=>{
      const el=document.querySelector(selector);
      const rect=el.getBoundingClientRect();
      return {selector,height:rect.height,minHeight:getComputedStyle(el).minHeight,
       left:rect.left,right:rect.right};
     })
    };
   });
   for(const control of measurements.controls){
    // In normal overview mode, some actions live behind the manage toggle.
    // Their computed minimum still matters, but hidden controls have no box.
    assert.ok(parseFloat(control.minHeight)>=43.5,
     'CSS minimum tap height too short at '+width+'px: '+JSON.stringify(control));
    if(control.height<1)continue;
    assert.ok(control.height>=43.5,
     'Tap target too short at '+width+'px: '+JSON.stringify(control));
    assert.ok(control.left>=-2&&control.right<=width+2,
     'Control outside viewport at '+width+'px: '+JSON.stringify(control));
   }
   assert.ok(measurements.scrollWidth<=width+2,
    'Horizontal overflow at '+width+'px: '+JSON.stringify(measurements));
  }finally{await context.close();}
 });
}
