import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeForecast} from '../lib/weather-core.mjs';
import {schoolWeatherSummary} from '../public/shared/school-weather-ui.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sample={
 properties:{timeseries:[
  {time:'2026-11-17T07:00:00Z',data:{
   instant:{details:{air_temperature:3.2,wind_speed:2.5}},
   next_1_hours:{summary:{symbol_code:'partlycloudy_day'},details:{precipitation_amount:0}}
  }},
  {time:'2026-11-17T08:00:00Z',data:{
   instant:{details:{air_temperature:4.4,wind_speed:3}},
   next_6_hours:{summary:{symbol_code:'rain'},details:{precipitation_amount:6}}
  }},
  {time:'2026-11-17T13:00:00Z',data:{
   instant:{details:{air_temperature:5.2,wind_speed:4}},
   next_1_hours:{summary:{symbol_code:'rain'},details:{precipitation_amount:0.8}}
  }}
 ]}};
test('MET source hours are retained in Norwegian time, rain is not invented',()=>{
 const result=summarizeForecast(sample);
 const d=result['2026-11-17'];
 assert.ok(d);
 assert.deepEqual(d.hours.map(x=>x.hour),[8,9,14]);
 assert.deepEqual(d.hours.map(x=>x.rainMm),[0,null,0.8]);
 assert.equal(d.hours[1].rainPeriod,6);
 assert.equal(d.hours[0].temperature,3.2);
 assert.equal(d.hours[2].wind,4);
 assert.equal(schoolWeatherSummary({days:result},'2026-11-17').temperature,'5 °C');
});
test('Missing hourly values remain unavailable rather than guessed',()=>{
 const result=summarizeForecast({properties:{timeseries:[{time:'2026-11-17T07:00:00Z',
  data:{instant:{details:{}},next_6_hours:{summary:{symbol_code:'cloudy'},details:{}}}}]}});
 const hour=result['2026-11-17'].hours[0];
 assert.equal(hour.temperature,null);
 assert.equal(hour.wind,null);
 assert.equal(hour.rainMm,null);
 assert.equal(schoolWeatherSummary({days:result},'2026-11-17').temperature,'— °C');
});
test('Family and child app have separate visible-entry points using same weather component',()=>{
 const family=read('public/family-ui.mjs'),child=read('public/barn/child.mjs');
 const fHtml=read('public/index.html'),cHtml=read('public/barn/index.html');
 for(const html of [fHtml,cHtml])assert.match(html,/school-weather\.css/);
 assert.match(fHtml,/id="family-school-weather"/);
 assert.match(cHtml,/id="child-school-weather"/);
 assert.match(child,/schoolWeather\.updateSchools\(\[child\.school\]\)/);
 assert.match(family,/schoolWeather\.updateSchools\(profiles\.map\(p=>p\.school\)\)/);
 assert.match(child,/schoolWeather\.updateSchools\(\[\]\)/);
 const ui=read('public/shared/school-weather-ui.mjs');
 assert.match(ui,/aria-haspopup="dialog"/);
 assert.match(ui,/\.showModal\(\)/);
 assert.match(ui,/data-weather-date/);
 assert.doesNotMatch(ui,/localStorage|sessionStorage|Bearer|child-access|familyId/);
});
test('Child PWA caches weather shell but not forecast API',()=>{
 const sw=read('public/barn/sw.js');
 assert.match(sw,/skoleuka-child-shell-v10/);
 assert.match(sw,/shared\/school-weather-ui\.mjs/);
 assert.match(sw,/shared\/school-weather\.css/);
 assert.match(sw,/url\.pathname\.startsWith\('\/api\/'\)/);
});
