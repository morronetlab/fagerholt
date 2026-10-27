import test from 'node:test';
import assert from 'node:assert/strict';
import {norwayCalendar, isExpiredSchoolDay, hasCalendarDateChanged, hourlyRefreshDue, REFRESH_INTERVAL_MS} from '../public/calendar.mjs';

const cal = iso => norwayCalendar(new Date(iso));
test('normal Monday, Tuesday and Friday select current day', () => {
 for(const [date, dow, week] of [['2026-10-26T11:00:00Z',0,44],['2026-10-27T12:00:00Z',1,44],['2026-10-30T11:00:00Z',4,44]]){
  const n=cal(date);assert.equal(n.day,dow);assert.equal(n.dow,dow);assert.equal(n.week,week);
 }
});
test('earlier weekdays expire, current/future weekdays stay available',()=>{
 for(let today=0;today<5;today++)for(let day=0;day<5;day++){
  assert.equal(isExpiredSchoolDay(day,today),day<today);
 }
 assert.equal(isExpiredSchoolDay(1,2),true); // Tuesday is expired on Wednesday
 assert.equal(isExpiredSchoolDay(3,2),false); // Thursday is still selectable
});
test('Saturday and Sunday expire all school days, never allowing past days',()=>{
 for(const today of [5,6])for(let day=0;day<5;day++)assert.equal(isExpiredSchoolDay(day,today),true);
 assert.equal(cal('2026-10-31T10:00:00Z').dow,5);
 assert.equal(cal('2026-11-01T10:00:00Z').dow,6);
});
test('new calendar day in Oslo triggers a reload even within the same week',()=>{
 const earlier=cal('2026-10-26T22:58:00Z');
 const later=cal('2026-10-26T23:01:00Z'); // Oslo moved to Tue 27 at 00:01 CET
 assert.equal(earlier.dow,0);assert.equal(later.dow,1);
 assert.equal(hasCalendarDateChanged(earlier,later),true);
 assert.equal(hasCalendarDateChanged(later,later),false);
});
test('weekly rollover updates ISO week and can change ISO year',()=>{
 const sun=cal('2026-11-01T10:00:00Z');const mon=cal('2026-11-02T10:00:00Z');
 assert.equal(sun.week,44);assert.equal(mon.week,45);
 assert.equal(hasCalendarDateChanged(sun,mon),true);
 const newYear=cal('2026-12-31T12:00:00Z');
 assert.equal(newYear.year,2026);assert.equal(newYear.week,53);
 const jan=cal('2027-01-04T12:00:00Z');
 assert.equal(jan.year,2027);assert.equal(jan.week,1);
});
test('hourly reload threshold: never early, always after one hour',()=>{
 const begin=100000;assert.equal(hourlyRefreshDue(begin,begin+REFRESH_INTERVAL_MS-1),false);
 assert.equal(hourlyRefreshDue(begin,begin+REFRESH_INTERVAL_MS),true);
 assert.equal(hourlyRefreshDue(begin,begin+2*REFRESH_INTERVAL_MS),true);
});
test('Oslo daylight saving offset changes never shift date labels incorrectly',()=>{
 assert.equal(cal('2026-10-25T22:59:00Z').dateKey,'2026-10-25');
 assert.equal(cal('2026-10-25T23:01:00Z').dateKey,'2026-10-26');
 assert.equal(cal('2026-03-29T21:59:00Z').dateKey,'2026-03-29');
 assert.equal(cal('2026-03-29T22:01:00Z').dateKey,'2026-03-30');
});
