import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeForecast,FORECAST_LOCATION,PENT_LINK} from '../lib/weather-core.mjs';
import handler from '../netlify/functions/weather.mjs';
function entry(time, temp, wind, symbol='partlycloudy_day', rain=0, hourBlock=1) {
 const period=`next_${hourBlock}_hours`;
 return {time,data:{instant:{details:{air_temperature:temp,wind_speed:wind}},[period]:{summary:{symbol_code:symbol},details:{precipitation_amount:rain}}}};
}
const forecast=(ts)=>({properties:{meta:{updated_at:'2026-10-26T06:00:00Z'},timeseries:ts}});
test('uses coordinates from Pent location, without scraping Pent',()=>{
 assert.deepEqual(FORECAST_LOCATION,{lat:58.14671,lon:7.9956});
 assert.equal(PENT_LINK,'https://pent.no/58.14671,7.9956');
});
test('groups forecasts by local school day in Europe/Oslo (winter time)',()=>{
 const d=summarizeForecast(forecast([
   entry('2026-10-26T07:00:00Z',5,2,'cloudy',0.1), // 08:00 Oslo
   entry('2026-10-26T11:00:00Z',9,4,'rain',0.4), // 12:00 Oslo
   entry('2026-10-26T15:00:00Z',6,3,'rain',0.3), // 16:00 Oslo
   entry('2026-10-27T11:00:00Z',12,7,'clearsky_day',0)
 ]));
 assert.equal(d['2026-10-26'].date,'2026-10-26');
 assert.equal(d['2026-10-27'].date,'2026-10-27');
});
test('summarizes temperature, precip and wind for correct selected dates',()=>{
 const days=summarizeForecast(forecast([
   entry('2026-10-26T07:00:00Z',5,2,'cloudy',0.1),
   entry('2026-10-26T11:00:00Z',9,4,'rain',0.4),
   entry('2026-10-26T15:00:00Z',6,3,'rain',0.3),
   entry('2026-10-27T11:00:00Z',12,7,'clearsky_day',0)
 ]));
 assert.equal(days['2026-10-26'].temperature,9);
 assert.equal(days['2026-10-26'].minTemp,5);
 assert.equal(days['2026-10-26'].maxTemp,9);
 assert.equal(days['2026-10-26'].windMs,4);
 assert.equal(days['2026-10-26'].rainMm,0.5);
 assert.equal(days['2026-10-26'].icon,'🌧️');
 assert.equal(days['2026-10-27'].temperature,12);
 assert.equal(days['2026-10-27'].icon,'☀️');
});
test('uses Oslo summer time and never invents missing rainfall',()=>{
 const days=summarizeForecast(forecast([
  {time:'2026-06-01T06:00:00Z',data:{instant:{details:{air_temperature:19,wind_speed:1}}}},
  {time:'2026-06-01T22:00:00Z',data:{instant:{details:{air_temperature:5}}}}
 ]));
 assert.equal(days['2026-06-01'].temperature,19);
 assert.equal(days['2026-06-01'].rainMm,null);
 assert.equal(days['2026-06-02'],undefined);
});
test('6-hour precipitation is explicitly approximate',()=>{
 const days=summarizeForecast(forecast([
  entry('2026-10-30T07:00:00Z',8,5,'rain',6,6)
 ]));
 assert.equal(days['2026-10-30'].rainApproximate,true);
 assert.equal(days['2026-10-30'].rainMm,6);
});
test('weather endpoint fetches MET API and sends day JSON with source credit',async()=>{
 const before=globalThis.fetch;
 let requestUrl,ua;
 globalThis.fetch=async(url,opts)=>{
  requestUrl=String(url);ua=opts.headers['User-Agent'];
  return new Response(JSON.stringify(forecast([entry('2026-10-26T11:00:00Z',9,4,'cloudy',0.2)])),
    {status:200,headers:{'expires':new Date(Date.now()+3600000).toUTCString(),'content-type':'application/json'}});
 };
 try{
  const response=await handler(new Request('https://site.netlify.app/api/weather'));
  const result=await response.json();
  assert.equal(response.status,200);
  assert.match(requestUrl,/api\.met\.no\/weatherapi\/locationforecast/);
  assert.match(ua,/Ukeplanen/);
  assert.equal(result.days['2026-10-26'].temperature,9);
  assert.equal(result.source,'Yr / Meteorologisk institutt');
  assert.equal(result.stale,false);
 }finally{globalThis.fetch=before}
});

test('selected school days stay independent across midnight and after-school rain is omitted',()=>{
  const days=summarizeForecast(forecast([
    entry('2026-10-26T11:00:00Z',10,2,'clearsky_day',0), // Monday 12:00
    entry('2026-10-26T16:00:00Z',9,2,'rain',5),          // Monday 17:00 – should NOT count
    entry('2026-10-27T11:00:00Z',11,4,'rain',2),        // Tuesday 12:00
  ]));
  assert.equal(days['2026-10-26'].description,'Sol');
  assert.equal(days['2026-10-26'].rainMm,0);
  assert.equal(days['2026-10-27'].description,'Regn');
  assert.equal(days['2026-10-27'].rainMm,2);
});
test('rain showers are described as showers, not steady all-day rain',()=>{
 const days=summarizeForecast(forecast([entry('2026-10-26T11:00:00Z',10,4,'lightrainshowers_day',0.2)]));
 assert.equal(days['2026-10-26'].description,'Regnbyger');
});
