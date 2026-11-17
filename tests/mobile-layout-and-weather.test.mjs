import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/original-look.css',import.meta.url),'utf8');
const shared=css.slice(css.indexOf('/* Mobile-first refinement:'));
test('Mobile selection preserves access to switching school and grade',()=>{
 assert.match(html,/id="mobile-selection-menu"/);
 assert.match(html,/id="mobile-change-grade"/);
 assert.match(html,/id="mobile-change-school"/);
 // The new design puts the switcher inside the plan view and provides
 // a dedicated back button while choosing a class.
 assert.match(html,/id="grade-back"/);
 assert.match(app,/\$\('app-view'\)\.hidden=inFamily\|\|welcome\|\|!chosen/);
 assert.match(app,/\$\('grade-back'\)\.addEventListener\('click'/);
 assert.match(app,/mobile-change-school'\)\.addEventListener\('click'/);
 assert.match(app,/mobile-change-grade'\)\.addEventListener\('click'/);
});
test('Individual school plans show the shared Weather 2.0 card even during PDF processing',()=>{
 assert.match(html,/id="plan-school-weather"/);
 assert.doesNotMatch(html,/id="weather-panel"/);
 assert.doesNotMatch(html,/id="weather-toggle"/);
 assert.match(html,/href="\/plan-weather-unified\.css"/);
 assert.match(app,/initSchoolWeather\(\{host:\$\('plan-school-weather'\),external:true\}\)/);
 assert.match(app,/planSchoolWeather\?\.updateSchools\(features\.weather/);
 assert.match(app,/planSchoolWeather\?\.setDate\(weekDayDate\(state\.day\)\)/);
 assert.doesNotMatch(app,/\$\('weather-panel'\)/);
 assert.doesNotMatch(app,/\$\('weather-toggle'\)/);
});
test('Weather fetch is independent from the PDF and keeps the existing rainwear hint',()=>{
 const weatherSource=app.slice(app.indexOf('async function reload('),app.indexOf('function openFamilyProfile('));
 assert.match(weatherSource,/void fetchJSON\(`\/api\/weather\?school=/);
 assert.match(weatherSource,/planSchoolWeather\?\.setForecast\(weather\)/);
 assert.match(weatherSource,/planSchoolWeather\?\.setError\(state\.weatherError\)/);
 assert.match(app,/\$\('rain-reminder'\)\.hidden=!rainy/);
 const ui=readFileSync(new URL('../public/shared/school-weather-ui.mjs',import.meta.url),'utf8');
 assert.match(ui,/function setDate\(date\)/);
 assert.match(ui,/const compactDate=preferredDate\|\|/);
 assert.match(ui,/aria-haspopup="dialog"/);
 assert.match(ui,/data-weather-date/);
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
test('Weather 2.0 adapts to the individual plan hero on desktop and mobile',()=>{
 const css=readFileSync(new URL('../public/plan-weather-unified.css',import.meta.url),'utf8');
 assert.match(css,/#app-hero #plan-school-weather/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/min-height:66px/);
 assert.match(shared,/@media\(prefers-reduced-motion:reduce\)/);
});
