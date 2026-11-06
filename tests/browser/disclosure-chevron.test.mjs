/** One CSS chevron for all expandable controls, including the current
 * "Viktig denne uka" and "Hva skjer i dag?" buttons. No family data or API. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';

let browser,server;
before(async()=>{server=await startStaticServer();
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();await server?.close();});

async function pageFor(t,width){
 const context=await browser.newContext({viewport:{width,height:950},locale:'nb-NO',reducedMotion:'reduce'});
 t.after(()=>context.close());
 const page=await context.newPage();
 const css=['style.css','original-look.css','family-look.css','family-v3.css',
  'family-mobile.css','onboarding-clarity.css','tomorrow-briefing.css',
  'family-mobile-polish.css','family-practical-controls.css','action-system.css'];
 const links=css.map(p=>'<link rel="stylesheet" href="'+server.baseURL+'/'+p+'">').join('');
 await page.setContent('<!doctype html><html lang="nb"><head><meta charset="utf-8">'+links+'</head><body>'+
  '<section id="welcome-view"><button id="landing-other-options" '+
  'class="welcome-other-options sk-action sk-action--disclosure" aria-expanded="false">'+
  'Andre måter å bruke Skoleuka</button></section>'+
  '<main id="family-view" data-family-mobile-view="overview">'+
  '<section class="family-tomorrow family-important">'+
  '<div class="family-important-actions">'+
  '<details id="family-practical-details" class="family-disclosure">'+
  '<summary class="sk-action sk-action--disclosure"><span>Alle skolebeskjeder og utstyr</span></summary>'+
  '<div class="family-disclosure-body">Dette er innholdet</div></details>'+
  '<button id="family-mobile-important-more" class="family-light-button sk-action sk-action--disclosure" '+
  'aria-expanded="false">Vis 1 til</button></div></section>'+
  '<section id="family-tomorrow-brief" class="family-tomorrow-brief">'+
  '<div class="family-tomorrow-brief-actions">'+
  '<button id="family-tomorrow-brief-more" class="family-light-button sk-action sk-action--disclosure" '+
  'aria-expanded="false">Vis alle 8 punkter</button></div></section>'+
  '<div class="family-reminders"><button id="family-reminders-more" '+
  'class="family-reminders-more sk-action sk-action--disclosure" aria-expanded="false">'+
  'Vis alle 8 praktiske beskjeder</button></div>'+
  '<details class="family-reminder-detail"><summary class="sk-action sk-action--disclosure">'+
  'Les hele beskjeden</summary><p>Et lengre kildeutdrag</p></details>'+
  '<details id="family-agenda-undated" class="family-agenda-undated">'+
  '<summary class="sk-action sk-action--disclosure">Beskjeder uten bestemt dag</summary>'+
  '<p>Uten dato</p></details>'+
  '<div class="family-child-actions"><button class="family-mobile-more sk-action sk-action--disclosure"'+
  ' aria-expanded="false">Flere</button></div>'+
  '<div class="family-agenda"><button class="family-agenda-expand sk-action sk-action--disclosure" '+
  'aria-expanded="false">Mer info</button></div></main>'+
  '<section id="app-view"><details class="details" id="notices-panel">'+
  '<summary class="sk-action sk-action--disclosure">Beskjeder fra skolen</summary><p>Les</p></details>'+
  '<details class="details" id="goals-panel"><summary class="sk-action sk-action--disclosure">'+
  'Læringsmål</summary><p>Mål</p></details>'+
  '<aside class="weather" id="weather-panel"><button id="weather-toggle" type="button" '+
  'class="weather-toggle sk-action sk-action--disclosure" aria-expanded="false">'+
  'Vær for valgt dag</button></aside></section></body></html>',{waitUntil:'load'});
 return page;
}
const style=async(page,selector)=>page.locator(selector).evaluate(el=>{
 const root=getComputedStyle(el),after=getComputedStyle(el,'::after');
 const rect=el.getBoundingClientRect();
 return {display:root.display,align:root.alignItems,justify:root.justifyContent,
  after:after.content,width:after.width,height:after.height,
  transform:after.transform,rectHeight:rect.height,rectWidth:rect.width};
});
test('Desktop: full-width notice disclosure and show-all button have one aligned chevron',async t=>{
 const p=await pageFor(t,1280);
 for(const selector of ['#family-practical-details > summary','#family-tomorrow-brief-more',
  '#family-reminders-more','.family-reminder-detail > summary','#family-agenda-undated > summary',
  '#notices-panel > summary','#goals-panel > summary']){
  const v=await style(p,selector);
  assert.equal(v.after,'""',selector+' must use CSS-only chevron, not Unicode');
  assert.equal(v.width,'8px',selector);
  assert.equal(v.height,'8px',selector);
  assert.ok(['flex','inline-flex'].includes(v.display),selector+' must keep label and arrow on same row');
  assert.equal(v.align,'center',selector);
 }
 const button=await style(p,'#family-tomorrow-brief-more');
 assert.ok(button.rectHeight<55,'Vis alle 8 punkter should not wrap its arrow below the text');
 const summary=await style(p,'#family-practical-details > summary');
 assert.ok(summary.rectWidth>button.rectWidth,'Full-width notices row must retain its layout');
 assert.equal(await p.locator('#family-mobile-important-more').isVisible(),false,
  'Mobile-only notices button must remain hidden on desktop');
 assert.equal(await p.locator('.family-mobile-more').isVisible(),false,
  'Mobile-only child actions must remain hidden on desktop');
});
test('Native summary and aria-expanded buttons rotate the SAME chevron',async t=>{
 const p=await pageFor(t,1280);
 const native='#family-practical-details > summary';
 const closed=(await style(p,native)).transform;
 await p.locator(native).click();
 assert.equal(await p.locator('#family-practical-details').evaluate(el=>el.open),true);
 assert.notEqual((await style(p,native)).transform,closed);
 await p.locator(native).click();
 assert.equal(await p.locator('#family-practical-details').evaluate(el=>el.open),false);
 const button='#family-tomorrow-brief-more';
 await p.locator(button).evaluate(el=>el.setAttribute('aria-expanded','true'));
 assert.equal((await style(p,button)).transform,
  (await p.locator(native).evaluate(el=>{el.parentElement.open=true;
   return getComputedStyle(el,'::after').transform;})));
});
test('375px: mobile notices and show-all use the same chevron without horizontal overflow',async t=>{
 const p=await pageFor(t,375);
 for(const selector of ['#family-practical-details > summary','#family-tomorrow-brief-more',
   '#family-mobile-important-more','.family-mobile-more','.family-agenda-expand']){
  const v=await style(p,selector);
  assert.ok(['flex','inline-flex'].includes(v.display),selector+' should be flex on mobile');
  assert.equal(v.after,'""',selector);
  assert.equal(v.width,'8px',selector);
  assert.equal(v.align,'center',selector);
 }
 const button=await style(p,'#family-tomorrow-brief-more');
 assert.ok(button.rectHeight<=55,'Mobile show-all label and chevron should stay in one line');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,
  'No new horizontal scrolling should be introduced');
 const landing=await style(p,'#landing-other-options'),weather=await style(p,'#weather-toggle');
 assert.equal(landing.after,'""');
 assert.equal(weather.after,'""');
});
