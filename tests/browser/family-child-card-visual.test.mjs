import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';

/** Browser layout checks for three representative child cards, real CSS,
 * and no real accounts or family data. */
let browser,server;
before(async()=>{server=await startStaticServer();
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();await server?.close();});
const card=name=>[
 '<article class="family-child" data-child-id="',name,'">',
 '<div class="family-child-heading"><span class="family-avatar">B</span><div>',
 '<h3>',name,'</h3><p>Wilds Minne skole · 2. klasse</p>',
 '<span class="family-child-week">UKE 45 · 2026</span></div></div>',
 '<div class="family-child-setup" data-setup-status="not_invited">',
 '<span class="family-child-setup-info"><strong>📱 Barneapp ikke aktivert</strong></span>',
 '<span class="family-child-setup-actions">',
 '<button class="family-child-qr sk-action sk-action--modal" type="button">Vis QR-kode</button>',
 '<button class="family-child-help sk-action sk-action--link" type="button">Hjelp</button></span></div>',
 '<p class="family-ai-label">✓ AI-tolket PDF · lagret</p>',
 '<div class="family-child-progress"><div><span>Lekser</span><b>0 av 5 fullført</b></div>',
 '<div class="family-progress-track"><span style="width:0%"></span></div></div>',
 '<details class="family-child-extra"><summary class="sk-action sk-action--disclosure">Lekser og pakkeliste</summary>',
 '<div class="family-child-extra-content"><div class="family-child-columns">',
 '<div><h4>Lekser i dag</h4><p class="family-muted">Ingen lekser i dag</p></div></div>',
 '<details class="family-packing-week"><summary class="sk-action sk-action--disclosure">Utstyr alle dager</summary>',
 '<div class="family-packing-days"><section><h4>Onsdag</h4>',
 '<label><input type="checkbox"> Gymtøy</label></section></div></details></div></details>',
 '<div class="family-child-actions"><button class="family-open sk-action sk-action--navigate">Åpne ukeplan →</button>',
 '<button class="family-soft sk-action sk-action--modal">Endre</button>',
 '<button class="family-remove sk-action sk-action--danger">Fjern</button></div></article>'
].join('');
async function setup(t,width){
 const context=await browser.newContext({viewport:{width,height:900}});
 t.after(()=>context.close());
 const page=await context.newPage();
 const styles=['style.css','family-look.css','family-v3.css','family-mobile.css',
  'family-mobile-polish.css','child-app-setup.css','action-system.css']
  .map(p=>'<link rel="stylesheet" href="'+server.baseURL+'/'+p+'">').join('');
 await page.setContent('<!doctype html><html lang="nb"><head><meta charset="UTF-8">'+styles+
  '</head><body><main id="family-view" class="family-view" data-family-mobile-view="overview"'+
  ' style="max-width:1120px;margin:auto"><section id="family-children" class="family-children">'+
  '<div class="family-cards">'+card('Barn 1')+card('Barn 2')+card('Barn 3')+
  '</div></section></main></body></html>',{waitUntil:'load'});
 return page;
}
const box=locator=>locator.boundingBox();
test('1280px desktop: three equally tall cards and QR actions on separate row',async t=>{
 const p=await setup(t,1280),cards=p.locator('.family-child');
 const r=await Promise.all([0,1,2].map(i=>box(cards.nth(i))));
 assert.ok(r.every(v=>Math.abs(v.y-r[0].y)<2),'Three cards should share a row');
 assert.ok(r.every(v=>Math.abs(v.height-r[0].height)<2),'Closed cards should be equal height');
 assert.ok(r.every(v=>v.width>=300),'Avoid narrow child cards');
 const info=await box(cards.first().locator('.family-child-setup-info'));
 const actions=await box(cards.first().locator('.family-child-setup-actions'));
 assert.ok(actions.y>=info.y+info.height-2,'QR controls require their own row');
 assert.ok(info.width>=250,'QR text must have sufficient width');
});
test('Nested disclosures have one centered CSS chevron and independent native open state',async t=>{
 const p=await setup(t,1280),card=p.locator('.family-child').first();
 const outer=card.locator('.family-child-extra'),first=outer.locator(':scope > summary');
 const style=await first.evaluate(el=>{
  const a=getComputedStyle(el),b=getComputedStyle(el,'::after');
  return {display:a.display,alignItems:a.alignItems,content:b.content,width:b.width,height:b.height};
 });
 assert.equal(style.display,'flex');
 assert.equal(style.alignItems,'center');
 assert.equal(style.content,'""');
 assert.equal(style.width,style.height);
 await first.click();
 assert.equal(await outer.evaluate(el=>el.open),true);
 const nested=outer.locator('.family-packing-week'),second=nested.locator(':scope > summary');
 const inner=await second.evaluate(el=>{const b=getComputedStyle(el,'::after');
  return {content:b.content,width:b.width,height:b.height};});
 assert.deepEqual(inner,{content:'""',width:style.width,height:style.height});
 await second.click();
 assert.equal(await nested.evaluate(el=>el.open),true);
 await first.click();
 assert.equal(await outer.evaluate(el=>el.open),false);
 assert.equal(await nested.evaluate(el=>el.open),true);
});
test('768px tablet: two columns and a third card on second row',async t=>{
 const p=await setup(t,768),cards=p.locator('.family-child');
 const r=await Promise.all([0,1,2].map(i=>box(cards.nth(i))));
 assert.ok(Math.abs(r[0].y-r[1].y)<2);
 assert.ok(r[2].y>r[0].y);
 for(let i=0;i<3;i++){
  const a=await box(cards.nth(i).locator('.family-child-actions')),b=await box(cards.nth(i));
  assert.ok(a.x>=b.x&&a.x+a.width<=b.x+b.width+1,'Actions stay in card');
 }
});
test('375px mobile: one column, QR status readable, no sideways scrolling',async t=>{
 const p=await setup(t,375),cards=p.locator('.family-child');
 const r=await Promise.all([0,1,2].map(i=>box(cards.nth(i))));
 assert.ok(r[1].y>=r[0].y+r[0].height-1);
 assert.ok(r[2].y>=r[1].y+r[1].height-1);
 assert.equal(await cards.first().locator('.family-child-setup').isVisible(),true);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 assert.ok((await box(cards.first().locator('.family-child-setup-info'))).width>=200);
});
