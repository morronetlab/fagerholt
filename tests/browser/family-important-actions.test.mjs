import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';

// Use the real dashboard markup and stylesheet order, but no live account
// or school APIs: this checks the compact footer at deterministic widths.
const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
const important=html.match(/<section class="family-tomorrow family-important"[\s\S]*?<\/section>/)?.[0];
const styles=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)]
 .map(match=>'<link rel="stylesheet" href="'+match[1]+'">').join('');
let browser,server;
before(async()=>{
 server=await startStaticServer();
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await server?.close();});

async function openFooter(t,width){
 assert.ok(important,'Important section must exist in index.html');
 const context=await browser.newContext({viewport:{width,height:850}});
 t.after(()=>context.close());
 const page=await context.newPage();
 await page.setContent('<!doctype html><html lang="nb"><head><base href="'+server.baseURL+
  '/">'+styles+'</head><body><main class="shell"><div id="family-view" class="family-view">'+
  important+'</div></main></body></html>',{waitUntil:'load'});
 await page.locator('#family-important-cards').evaluate(el=>{
  el.innerHTML='<div class="family-important-entry">Et viktig punkt</div>';
 });
 await page.locator('#family-mobile-important-more').evaluate(el=>{el.hidden=false;});
 return page;
}

test('mobile important-footer actions sit together and are not full-width rows',async t=>{
 const page=await openFooter(t,390);
 const metrics=await page.evaluate(()=>{
  const first=document.querySelector('#family-mobile-important-more').getBoundingClientRect();
  const second=document.querySelector('#family-practical-details>summary').getBoundingClientRect();
  const row=document.querySelector('.family-important-actions').getBoundingClientRect();
  return {first:{x:first.x,y:first.y,width:first.width},
   second:{x:second.x,y:second.y,width:second.width},rowWidth:row.width};
 });
 assert.ok(metrics.first.width<metrics.rowWidth*.65,'Preview action should be a compact pill');
 assert.ok(metrics.second.width<metrics.rowWidth*.9,'School messages should not fill the row');
 assert.ok(Math.abs(metrics.first.y-metrics.second.y)<=2,'Actions should share one row at phone width');
 assert.ok(metrics.second.x>metrics.first.x,'Second action should follow the first');
 await page.locator('#family-practical-details>summary').click();
 assert.equal(await page.locator('#family-practical-details').evaluate(el=>el.open),true);
 const width=await page.locator('#family-practical-details').evaluate(el=>el.getBoundingClientRect().width);
 assert.ok(width>=metrics.rowWidth*.95,'Expanded detail content should use the available width');
});

test('desktop keeps only the school-message action',async t=>{
 const page=await openFooter(t,1100);
 assert.equal(await page.locator('#family-mobile-important-more')
  .evaluate(el=>getComputedStyle(el).display),'none');
 assert.equal(await page.locator('#family-practical-details>summary').isVisible(),true);
});
