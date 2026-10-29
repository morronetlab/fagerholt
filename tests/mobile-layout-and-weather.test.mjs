import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/original-look.css',import.meta.url),'utf8');
const shared=css.slice(css.indexOf('/* Mobile-first refinement:'));
test('Mobile selection keeps school switching available before selecting a grade',()=>{
 assert.match(html,/id="mobile-selection-menu"/);
 assert.match(html,/id="mobile-change-grade"/);
 assert.match(html,/id="mobile-change-school"/);
 assert.match(app,/\$\('mobile-selection-menu'\)\.hidden=inFamily\|\|!hasSchool/);
 assert.match(app,/\$\('mobile-change-grade'\)\.hidden=inFamily\|\|!chosen/);
 assert.match(app,/mobile-change-school'\)\.addEventListener\('click'/);
 assert.match(app,/mobile-change-grade'\)\.addEventListener\('click'/);
});
test('Weather hides during PDF download and AI analysis, but not completed or failed states',()=>{
 assert.match(html,/id="weather-panel" class="weather"/);
 assert.match(app,/waitingForPlan=state\.loading\|\|p\?\.aiStatus==='processing'/);
 assert.match(app,/\$\('weather-panel'\)\.hidden=waitingForPlan\|\|!features\.weather/);
 assert.match(app,/\$\('app-hero'\)\.classList\.toggle\('is-awaiting',waitingForPlan\)/);
 assert.match(shared,/\.hero\.is-awaiting \.weather\{display:none!important\}/);
 assert.match(shared,/\.weather:not\(\[hidden\]\)/);
});
test('Compact weather bar can be expanded and has accessible state',()=>{
 assert.match(html,/id="weather-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="weather-details"/);
 assert.match(html,/id="weather-details"/);
 assert.match(html,/id="weather-desc"/);
 assert.match(html,/id="weather-location"/);
 assert.match(app,/\$\('weather-toggle'\)\.addEventListener\('click'/);
 assert.match(app,/setAttribute\('aria-expanded',String\(expanded\)\)/);
 assert.match(shared,/\.weather\.is-expanded \.weather-details\{display:block\}/);
});
test('Mobile breakpoint has usable day buttons, readable text and 44px actions',()=>{
 assert.match(shared,/@media \(max-width: 700px\)/);
 assert.match(shared,/\.day\{min-height:54px/);
 assert.match(shared,/\.day span\{font-size:12px/);
 assert.match(shared,/\.mobile-selection-menu summary\{[^}]*min-height:44px/);
 assert.match(shared,/\.checkrow input,\.mission-check input\{min-width:22px/);
 assert.match(shared,/\.homework \.items\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(shared,/\.special-crop-button,\.special-expand\{min-height:44px/);
 assert.match(shared,/@media\(max-width:360px\)/);
});
test('Reduce top-of-page height during AI analysis without changing AI polling',()=>{
 assert.match(shared,/\.hero\.is-awaiting \.hero-intro h1,/);
 assert.match(shared,/\.hero\.is-awaiting \.hero-actions\{display:none\}/);
 assert.match(shared,/\.plan-feedback\{padding:17px 15px/);
 assert.match(app,/statusOnly=1/);
 assert.match(app,/state\.plan\?\.aiStatus==='processing'\?reload\(\{quiet:true,statusOnly:true\}\):reload\(\)/);
});
test('Responsive layer preserves reduced-motion behavior and desktop weather',()=>{
 assert.match(shared,/\.mobile-selection-menu,\.weather-toggle\{display:none\}/);
 assert.match(shared,/\.weather-details\{min-width:0\}/);
 assert.match(shared,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/\.weather\{background:#fff/);
});
