/** Browser guard against malformed section nesting and mobile overflow. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
let server,browser;
before(async()=>{server=await startStaticServer();browser=await chromium.launch({headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();await server?.close();});
for(const width of [360,390,700,1100]){
 test('Weekly plan cards and mobile actions at '+width+'px',async t=>{
  const context=await browser.newContext({viewport:{width,height:860}});
  t.after(()=>context.close());
  const page=await context.newPage();
  await page.route('**/app.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:''}));
  await page.goto(server.baseURL+'/',{waitUntil:'load'});
  const structure=await page.evaluate(()=>{
   const q=s=>document.querySelector(s);
   return {
    program:q('#plan-columns > section[aria-labelledby="program-title"]')?.contains(q('#day-program')),
    bag:q('#plan-columns > section[aria-labelledby="bag-title"]')?.contains(q('#bag-list')),
    columns:q('#plan-columns')?.querySelectorAll(':scope > section.panel').length,
    progress:q('section.homework-studio')?.contains(q('#homework-progress')),
    homework:q('section.homework-studio')?.contains(q('#homework-list')),
    vocabulary:q('#vocabulary-panel')?.contains(q('#vocabulary-list')),
    norwegian:q('#vocabulary-panel-nb')?.contains(q('#vocabulary-list-nb')),
    source:q('#app-view')?.contains(q('#report-plan-issue'))
   };
  });
  assert.deepEqual(structure,{program:true,bag:true,columns:2,progress:true,
   homework:true,vocabulary:true,norwegian:true,source:true});
  if(width>700)return;
  await page.evaluate(()=>{
   document.documentElement.classList.add('skoleuka-route-ready');
   document.querySelector('#app-view').hidden=false;
   document.querySelector('#homework-progress').hidden=false;
   document.querySelector('#bag-list').innerHTML=
    '<label class="checkrow"><input type="checkbox"><span class="checktext"><span class="content-type-label content-kind-practical">Praktisk fra ukeplanen</span><span class="packing-item-label">Bålmat (valgfritt)</span></span></label>';
   document.querySelector('#homework-list').innerHTML=
    '<div class="homework-assist-row"><div class="homework-card-tags"><span class="subject">Engelsk</span></div><label class="checkrow"><input type="checkbox"><span class="checktext"><span class="homework-card-body">Øv på ordene i ukeplanen sammen med en voksen.</span></span></label><div class="homework-card-actions"><button class="helper-open sk-action sk-action--modal">✨ Få hjelp</button></div></div>';
  });
  const g=await page.evaluate(()=>{
   const q=s=>document.querySelector(s),rect=s=>q(s).getBoundingClientRect();
   return {viewport:innerWidth,scroll:document.documentElement.scrollWidth,
    badgeAboveText:rect('#bag-list .content-type-label').bottom<=rect('#bag-list .packing-item-label').top+1,
    helpInside:rect('#homework-list .helper-open').right<=rect('#homework-list').right+1,
    reportInside:rect('section.homework-studio .section-report').right<=rect('section.homework-studio').right+1,
    reportOneLine:getComputedStyle(q('section.homework-studio .section-report')).whiteSpace==='nowrap'};
  });
  assert.ok(g.scroll<=g.viewport+1,JSON.stringify(g));
  for(const key of ['badgeAboveText','helpInside','reportInside','reportOneLine'])
   assert.equal(g[key],true,JSON.stringify(g));
 });
}
