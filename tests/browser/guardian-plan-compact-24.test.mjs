/** Mobile UX regression for the parent's single-child weekly plan.
 * Standalone fixture exercises CSS at realistic widths without family accounts.
 */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {startStaticServer} from './static-server.mjs';

const name=process.env.QA_BROWSER||'chromium';
const engine={chromium,firefox,webkit}[name];
if(!engine)throw Error('Unknown QA_BROWSER: '+name);
let browser,server;
before(async()=>{server=await startStaticServer();browser=await engine.launch({headless:true});});
after(async()=>{await browser?.close();await server?.close();});

const styles=['/style.css','/original-look.css','/guardian-plan.css',
 '/plan-weather-unified.css','/plan-mobile-refinement.css',
 '/guardian-plan-compact-24.css'];
for(const width of [320,390,700,1024]){
 test('Guardian weekly plan stays compact and accessible at '+width+'px ('+name+')',async()=>{
  const context=await browser.newContext({viewport:{width,height:840},serviceWorkers:'block'});
  try{
   const page=await context.newPage();
   await page.goto(server.baseURL+'/barn/',{waitUntil:'domcontentloaded'});
   await page.setContent(`<!doctype html><html lang="nb"><head><meta name="viewport" content="width=device-width,initial-scale=1">
    ${styles.map(href=>'<link rel="stylesheet" href="'+href+'">').join('')}</head>
    <body class="guardian-plan-active"><div class="shell"><main id="app-view">
      <nav id="guardian-plan-toolbar" class="guardian-plan-toolbar">
       <button class="guardian-plan-back">← Min familie</button>
       <div class="guardian-plan-profiles">
        <button type="button">Maya</button><button type="button" aria-pressed="true">Ailin</button>
       </div>
      </nav>
      <section id="guardian-plan-summary" class="guardian-plan-summary">
       <div class="guardian-plan-summary-line"><div><strong>Onsdag 25. nov.</strong>
       <span>Fagerholt skole · 3. trinn · Rød</span></div>
       <span class="guardian-plan-progress">0 av 1 lekser i dag</span></div>
       <p class="guardian-plan-packing-state">Ingen ekstra utstyr oppgitt for denne dagen.</p>
       <div class="guardian-plan-shortcuts"><button>Skoledag</button><button>Pakkeliste</button>
        <button>Lekser</button><button>Beskjeder</button></div>
      </section>
      <section id="app-hero" class="hero">
       <div class="hero-intro"><div class="hero-actions">
        <span id="status-pill" class="state-pill">AI-tolket ukeplan</span>
        <button id="reload" class="small-button">↻ Oppdater</button>
        <a id="school-source" href="#source">Skolens trinnside ↗</a>
       </div></div>
       <div id="plan-school-weather"><div class="school-weather-card">
        <button class="school-weather-open">🌤 Været i skoleområdet — 0 °C</button>
       </div></div>
      </section>
      <div id="warning-area" class="alert">AI-tolket ukeplan. Kontroller alltid original-PDF ved tvil.</div>
      <nav id="day-buttons" class="weekdays">${['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'].map(day=>
       '<button type="button" class="day"><span>'+day+'</span><strong>25. nov.</strong></button>').join('')}
      </nav>
      <div id="plan-columns" class="columns"><section class="panel">
       <div class="panel-head"><div><h2>Dette skjer i dag</h2></div></div>
      </section></div>
     </main></div></body></html>`,{waitUntil:'load'});
   const measures=await page.evaluate(()=>{
    const box=selector=>{
     const element=document.querySelector(selector);
     const r=element.getBoundingClientRect();
     return {left:r.left,right:r.right,height:r.height,width:r.width,
      minHeight:getComputedStyle(element).minHeight,visible:getComputedStyle(element).display!=='none'};
    };
    return {viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,
     hero:box('#app-hero'),status:box('#status-pill'),reload:box('#reload'),source:box('#school-source'),
     weather:box('.school-weather-open'),toolbar:box('.guardian-plan-toolbar'),
     shortcuts:[...document.querySelectorAll('.guardian-plan-shortcuts button')].map(el=>{
      const r=el.getBoundingClientRect();return {height:r.height};
     }),tabs:[...document.querySelectorAll('#day-buttons button')].map(el=>el.getBoundingClientRect().height)};
   });
   assert.equal(measures.source.visible,true,'School PDF source stays available');
   assert.equal(measures.weather.visible,true,'Weather stays available');
   assert.equal(measures.status.visible,true,'AI status stays visible');
   assert.ok(measures.scroll<=width+2,'Unexpected page-wide overflow: '+JSON.stringify(measures));
   if(width<=700){
    assert.ok(measures.hero.height<245,
     'Metadata and weather should not dominate the viewport: '+JSON.stringify(measures));
    assert.ok(measures.reload.height>=43.5,'Refresh should be tappable');
    assert.ok(measures.shortcuts.every(x=>x.height>=43.5),'All four shortcuts should be tappable');
    assert.ok(measures.toolbar.height<=74,'Sibling navigation should remain compact');
    assert.ok(measures.tabs.every(h=>h>=57.5),'Day selection remains usable');
   }
  }finally{await context.close();}
 });
}
