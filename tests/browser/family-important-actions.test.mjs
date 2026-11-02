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

test('Mobile: one calm full-width detail row, optional compact preview and one period filter',async t=>{
 const page=await openFooter(t,390);
 const dimensions=await page.evaluate(()=>{
  const first=document.querySelector('#family-mobile-important-more').getBoundingClientRect();
  const second=document.querySelector('#family-practical-details>summary').getBoundingClientRect();
  const row=document.querySelector('.family-important-actions').getBoundingClientRect();
  return {firstWidth:first.width,summaryWidth:second.width,rowWidth:row.width,stacked:second.top>=first.bottom};
 });
 assert.ok(dimensions.firstWidth<dimensions.rowWidth*.65,'Extra preview remains compact');
 assert.ok(dimensions.summaryWidth>=dimensions.rowWidth*.95,
  'Full details are a single clear row, not a second chip');
 assert.equal(dimensions.stacked,true,'Period controls must not crowd the preview action');
 await page.locator('#family-practical-details>summary').click();
 assert.equal(await page.locator('#family-practical-details').evaluate(el=>el.open),true);
 const filter=page.locator('#family-focus-filter');
 assert.equal(await filter.isVisible(),true);
 assert.deepEqual(await filter.locator('option').allTextContents(),
  ['Hele uka','Neste skoledag','I dag']);
 assert.equal(await page.locator('[data-family-focus]').count(),0);
});
test('Desktop: one disclosure row and a compact native filter',async t=>{
 const page=await openFooter(t,1100);
 assert.equal(await page.locator('#family-mobile-important-more')
  .evaluate(el=>getComputedStyle(el).display),'none');
 const summary=page.locator('#family-practical-details>summary');
 assert.equal(await summary.isVisible(),true);
 await summary.click();
 const controls=await page.locator('.family-practical-toolbar').evaluate(node=>({
  children:node.children.length,
  filter:getComputedStyle(node.querySelector('select')).display
 }));
 assert.equal(controls.children,2);
 assert.notEqual(controls.filter,'none');
});
