import test from 'node:test';
import assert from 'node:assert/strict';
import {dayDate} from '../public/shared/calendar.mjs';
import {SNAPSHOT_2026_27,officialSnapshot,parseMunicipalYearHtml,
 municipalDatesForYear,SKOLERUTE_URL} from '../lib/kristiansand-calendar.mjs';
import {calendarHighlights} from '../public/shared/school-calendar-highlights.mjs';
import {createSchoolCalendarHandler} from '../netlify/functions/school-calendar.mjs';

const html=[
 '<html><h2>Skoleruta 2025-2026</h2><table><tr><th>Måned</th><th>Dato</th><th>Merknad</th></tr>',
 '<tr><td>August</td><td>14.</td><td>Skolestart</td></tr></table>',
 '<h2>Skoleruta 2026-2027</h2>',
 '<table><tr><th>Måned</th><th>Dato</th><th>Merknad</th></tr>',
 ...SNAPSHOT_2026_27.map(([month,date,label])=>'<tr><td>'+month+'</td><td>'+date+'</td><td>'+label+'</td></tr>'),
 '<tr><td>&nbsp;</td><td>8.</td><td>Fridag (lokal justering i testen)</td></tr>',
 '</table><p>SFO&nbsp;er stengt julaften og nyttårsaften 2026 og uke 27-30 i 2027.</p>',
 '<h2>Skoleruta 2027-2028</h2><table><tr><th>Måned</th><th>Dato</th><th>Merknad</th></tr>',
 '<tr><td>August</td><td>19.</td><td>Skolestart</td></tr>',
 '<tr><td>Oktober</td><td>4.-8.</td><td>Høstferie uke 40</td></tr>',
 '<tr><td>November</td><td>12.</td><td>Fridag</td></tr>',
 '<tr><td>Desember</td><td>21.</td><td>Juleferie</td></tr>',
 '<tr><td>Januar</td><td>4.</td><td>Skolestart</td></tr>',
 '<tr><td>Februar</td><td>21.-25.</td><td>Vinterferie</td></tr>',
 '<tr><td>April</td><td>10.-17.</td><td>Påskeferie</td></tr>',
 '<tr><td>Mai</td><td>1.</td><td>Arbeidernes dag</td></tr>',
 '<tr><td>Mai</td><td>17.</td><td>Grunnlovsdag</td></tr>',
 '<tr><td>Juni</td><td>22.</td><td>Siste skoledag</td></tr>',
 '</table><p>SFO er stengt julaften og nyttårsaften 2027 og uke 27-30 i 2028.</p></html>'
].join('');
const p=id=>({id,name:id,school:'fagerholt',grade:'3'});
const calendar=(week,upcoming=false)=>({year:2026,week,
 today:dayDate(2026,week,upcoming?0:2),upcoming});
const snapshotDates=municipalDatesForYear({
 ...officialSnapshot(2026),sfo:{...officialSnapshot(2026).sfo,nextSchoolStart:'2027-08-19'}
},2026);
const at=date=>snapshotDates.find(x=>x.date===date);
test('Official 2026-27 snapshot: Friday 6 November is SCHOOL-FREE, SFO UNKNOWN (not automatically closed)',()=>{
 const day=at('2026-11-06');
 assert.ok(day);assert.equal(day.schoolFree,true);
 assert.equal(day.sfoStatus,'unknown');assert.equal(day.sfoClosed,false);
 assert.match(day.label,/Fridag \(Sørlandsk lærerstevne\)/);
 assert.ok(!snapshotDates.some(x=>x.date==='2026-10-30'),'Ordinary Friday must not be mislabeled');
});
test('Christmas holidays end at first school day, SFO closed only when municipality explicitly states it',()=>{
 assert.equal(at('2026-12-21')?.label,'Juleferie');
 assert.equal(at('2026-12-24')?.schoolFree,true);
 assert.equal(at('2026-12-24')?.sfoStatus,'closed');
 assert.equal(at('2026-12-31')?.sfoStatus,'closed');
 assert.equal(at('2027-01-04')?.schoolFree,true);
 assert.ok(!at('2027-01-05')?.schoolFree);
 assert.equal(at('2026-12-23')?.sfoStatus,'unknown');
});
test('May 2027 bridge day and summer SFO closure are sourced independently',()=>{
 assert.equal(at('2027-05-07')?.schoolFree,true);
 assert.equal(at('2027-05-07')?.sfoStatus,'unknown');
 assert.equal(at('2027-07-05')?.sfoStatus,'closed');
 assert.equal(at('2027-07-05')?.schoolFree,true);
 assert.equal(at('2027-08-18')?.schoolFree,true);
 assert.equal(at('2027-08-19'),undefined);
});
test('Parse actual municipal-table structure including blank continuation month, ignore other year',()=>{
 const data=parseMunicipalYearHtml(html,2026);
 assert.equal(data.origin,'live');
 assert.ok(data.sfo);
 assert.equal(data.rows.find(x=>x[1]==='8.')[2],'Fridag (lokal justering i testen)');
 const events=municipalDatesForYear(data,2026);
 assert.equal(events.find(x=>x.date==='2027-05-08'),undefined,'Saturday never shown');
 assert.equal(events.find(x=>x.date==='2026-11-06').sfoStatus,'unknown');
 assert.ok(!parseMunicipalYearHtml('<h2>Skoleruta 2026-2027</h2><table></table>',2026));
});
test('Broken official source does not get interpreted as a valid live calendar',()=>{
 assert.equal(parseMunicipalYearHtml('<h2>Skoleruta 2026-2027</h2><p>Fridag 6 november</p>',2026),null);
 assert.equal(parseMunicipalYearHtml('<html>'+('x'.repeat(400))+'</html>',2026),null);
 assert.equal(officialSnapshot(2025),null);
});
const fakeRequest=(week=45,year=2026,school='fagerholt')=>
 new Request('https://skoleuka.no/api/school-calendar?school='+school+'&year='+year+'&week='+week);
test('Read-only calendar endpoint uses live official source and never submits school-PDF data',async()=>{
 const requests=[];
 const handler=createSchoolCalendarHandler({fetchImpl:async(url,opts)=>{
  requests.push({url,opts});return {ok:true,headers:new Headers({'content-type':'text/html'}),
   text:async()=>html};
 }});
 const response=await handler(fakeRequest());
 assert.equal(response.status,200);
 const json=await response.json();
 assert.equal(json.schoolId,'fagerholt');
 assert.equal(json.year,2026);assert.equal(json.week,45);
 assert.equal(json.sourceStatus,'live');
 assert.equal(json.scope,'municipal_default');assert.equal(json.localChangesPossible,true);
 assert.equal(json.sourceUrl,SKOLERUTE_URL);
 assert.deepEqual(json.events.map(x=>x.date),['2026-11-06']);
 assert.equal(json.events[0].sfoStatus,'unknown');
 assert.equal(requests.length,1);
 assert.equal(requests[0].url,SKOLERUTE_URL);
 assert.equal(requests[0].opts.method,undefined,'GET only');
});
test('If municipality cannot be reached, show verified source snapshot visibly as a fallback',async()=>{
 const handler=createSchoolCalendarHandler({fetchImpl:async()=>{throw Error('offline');}});
 const result=await (await handler(fakeRequest())).json();
 assert.equal(result.sourceStatus,'snapshot');
 assert.equal(result.checkedAt,'2026-10-30');
 assert.equal(result.events[0]?.date,'2026-11-06');
 assert.equal(result.events[0]?.sfoStatus,'unknown');
 const future=await (await handler(fakeRequest(45,2028))).json();
 assert.equal(future.sourceStatus,'unavailable');
 assert.deepEqual(future.events,[]);
});
test('Invalid IDs, other HTTP methods and nonexistent week numbers cannot trigger arbitrary fetches',async()=>{
 let count=0;
 const handler=createSchoolCalendarHandler({fetchImpl:async()=>{count++;throw Error('bad');}});
 for(const request of [
  fakeRequest(54),fakeRequest(45,2026,'other-school'),
  fakeRequest(45,1990),new Request('https://skoleuka.no/api/school-calendar',{method:'POST'})
 ])assert.notEqual((await handler(request)).status,200);
 assert.equal(count,0);
});
test('Municipal events appear with no PDF and once per school (two children on same school)',()=>{
 const all=[p('child-cal-1'),p('child-cal-2')];
 const data={schoolId:'fagerholt',year:2026,week:45,sourceStatus:'live',
  sourceUrl:SKOLERUTE_URL,schoolUrl:'https://www.minskole.no/fagerholt',
  checkedAt:'2026-10-30',events:[at('2026-11-06')]};
 const actual=calendarHighlights({profiles:all,
  calendars:new Map([['fagerholt',data]]),calendar:calendar(45,true),focus:'week'});
 assert.equal(actual.length,1);
 assert.equal(actual[0].sourceType,'municipal');
 assert.equal(actual[0].adultImpact,'workday');
 assert.equal(actual[0].date,'2026-11-06');
 assert.equal(actual[0].sfoStatus,'unknown');
 assert.match(actual[0].name,/Fagerholt/);
 assert.equal(calendarHighlights({profiles:all,calendars:new Map([['fagerholt',data]]),
  calendar:calendar(44,true),focus:'week'}).length,0,'Never show a different week');
});
test('Future critical school calendar date remains visible on Next school day, not past days on Today tab',()=>{
 const data={schoolId:'fagerholt',year:2026,week:45,sourceStatus:'live',
  events:[at('2026-11-06')]};
 const calendars=new Map([['fagerholt',data]]);
 const now=calendar(45,false);
 assert.equal(calendarHighlights({profiles:[p('child-cal-1')],calendars,calendar:now,focus:'next'}).length,1);
 assert.equal(calendarHighlights({profiles:[p('child-cal-1')],calendars,calendar:now,focus:'today'}).length,0);
});
