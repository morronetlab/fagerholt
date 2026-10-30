/** Optional CI probe of today's public Kristiansand municipality HTML.
 * Never silently declares an unparsed live source verified.
 */
import assert from 'node:assert/strict';
import {SKOLERUTE_URL,parseMunicipalYearHtml,municipalDatesForYear}
 from '../lib/kristiansand-calendar.mjs';

const response=await fetch(SKOLERUTE_URL,{headers:{
 Accept:'text/html','User-Agent':'Skoleuka calendar source QA (https://skoleuka.no)'
},signal:AbortSignal.timeout(12000)});
assert.ok(response.ok,'Municipality source HTTP '+response.status);
const html=await response.text();
assert.ok(html.length>500);
const data=parseMunicipalYearHtml(html,2026);
assert.ok(data,'Municipal year 2026-27 HTML table could not be parsed');
assert.ok(data.sfo,'Municipality SFO closure statement could not be parsed');
const entries=municipalDatesForYear({...data,sfo:{
 ...data.sfo,nextSchoolStart:'2027-08-19'
}},2026);
const byDate=date=>entries.find(x=>x.date===date);
assert.ok(byDate('2026-11-06')?.schoolFree,'6 November 2026 must be pupil-free');
assert.equal(byDate('2026-11-06')?.sfoStatus,'unknown','Do not invent SFO closure');
assert.ok(byDate('2026-12-24')?.sfoClosed,'Christmas Eve SFO is explicitly closed');
assert.equal(byDate('2027-05-07')?.schoolFree,true);
console.info('LIVE MUNICIPAL SOURCE VERIFIED',JSON.stringify({
 url:SKOLERUTE_URL,bytes:html.length,rows:data.rows.length,
 november6:byDate('2026-11-06'),december24:byDate('2026-12-24'),
 may7:byDate('2027-05-07')
}));
