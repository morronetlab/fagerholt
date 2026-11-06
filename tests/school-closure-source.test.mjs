import test from 'node:test';
import assert from 'node:assert/strict';
import {extractSchoolClosuresFromPdf} from '../lib/school-closure-source.mjs';
import {analyzePdfPages} from '../lib/plan-core.mjs';
import {dayDate} from '../public/shared/calendar.mjs';
import {profileSummary} from '../public/shared/family-core.mjs';
import {practicalHighlights} from '../public/shared/practical-highlights.mjs';

const page=rows=>({width:620,height:780,items:rows.map(([text,x,y])=>({
 text,x,y,width:Math.max(10,text.length*5)
}))});
const source=(text)=>page([[text,40,90]]);
const timetable=()=>page([
 ['Mandag',20,24],['Tirsdag',138,24],['Onsdag',256,24],
 ['Torsdag',374,24],['Fredag',492,24],
 ['Norsk',40,80],['Matte',160,80],['Naturfag',280,80],
 ['Gym – Husk gymtøy',396,80],['Engelsk',510,80],
 ['Friminutt',40,112]
]);
const planFor=(pages,week=45,year=2026)=>analyzePdfPages(pages,'4',
 'https://www.minskole.no/DynamicContent/Documents/test.pdf',week,year,
 'https://www.minskole.no/test/');
const compact=(records)=>records.map(x=>({type:x.type,days:x.closedDays,text:x.noticeText}));

test('Lovisenlund week 45: explicit planning days survive missing section headers',()=>{
 const results=extractSchoolClosuresFromPdf([
  source('Dette blir en kort uke fordi skolen har planleggingsdager torsdag og fredag.')
 ],2026,45);
 assert.deepEqual(results.map(x=>x.closedDays),[['Torsdag','Fredag']]);
 assert.match(results[0].noticeText,/planleggingsdager torsdag og fredag/i);
 const plan=planFor([timetable(),source('Dette blir en kort uke fordi skolen har planleggingsdager torsdag og fredag.')]);
 assert.ok(plan.notices.some(x=>/planleggingsdager/i.test(x)));
 assert.equal(plan.days.Torsdag.closed,true);
 assert.equal(plan.days.Fredag.closed,true);
 assert.equal(plan.days.Torsdag.bring.length,0);
 assert.equal(plan.days.Torsdag.events.length,0);
 assert.ok(plan.dayNotes.Torsdag.some(x=>/planleggingsdager/i.test(x.text)));
 assert.equal(plan.days.Mandag.closed,undefined);
 assert.ok(plan.days.Mandag.events.length>0);
});

test('Nygård week 45: source dates 5–6 November override routine Thursday gym',()=>{
 assert.equal(dayDate(2026,45,3),'2026-11-05');
 assert.equal(dayDate(2026,45,4),'2026-11-06');
 const note='Annen informasjon: Denne uken er skolen stengt torsdag 05.november og fredag 6.november. Minner om innesko.';
 const results=extractSchoolClosuresFromPdf([source(note)],2026,45);
 assert.equal(results.length,1);
 assert.deepEqual(results[0].closedDays,['Torsdag','Fredag']);
 assert.match(results[0].noticeText,/Skolen stengt torsdag 5. november og fredag 6. november/);
 const plan=planFor([timetable(),source(note)]);
 assert.ok(plan.notices.some(x=>x.toLowerCase().includes('skolen stengt')));
 assert.equal(plan.days.Torsdag.closed,true);
 assert.deepEqual(plan.days.Torsdag.bring,[]);
 assert.deepEqual(plan.days.Torsdag.events,[]);
 assert.ok(!plan.days.Mandag.closed);
});

test('Fagerholt week 44: future 5–6 November closure MUST NOT close October 29–30',()=>{
 assert.equal(dayDate(2026,44,3),'2026-10-29');
 const note='Viktige datoer torsdag 5. november og fredag 6. november Planleggingsdag skole og SFO er stengt';
 const results=extractSchoolClosuresFromPdf([source(note)],2026,44);
 assert.equal(results.length,1);
 assert.deepEqual(results[0].closedDays,[]);
 assert.match(results[0].noticeText,/5\. november/);
 const plan=planFor([timetable(),source(note)],44);
 assert.notEqual(plan.days.Torsdag.closed,true);
 assert.ok(plan.days.Torsdag.events.some(e=>/gym/i.test(e.title)));
 assert.ok(plan.days.Torsdag.bring.some(x=>/gymtøy/i.test(x.label)));
});

test('Explicitly dated closure must match actual selected ISO year and week',()=>{
 const s=source('Skolen stengt torsdag 05.november og fredag 6.november');
 assert.deepEqual(extractSchoolClosuresFromPdf([s],2027,45)[0].closedDays,[]);
 assert.deepEqual(extractSchoolClosuresFromPdf([s],2026,44)[0].closedDays,[]);
 const bad=source('Skolen stengt torsdag 31.november');
 assert.deepEqual(extractSchoolClosuresFromPdf([bad],2026,45)[0]?.closedDays||[],[]);
 const explicitOtherYear=source('Skolen stengt torsdag 05.november 2027 og fredag 6.november 2027');
 assert.deepEqual(extractSchoolClosuresFromPdf([explicitOtherYear],2026,45)[0]?.closedDays||[],[],
  'A matching day/month in the WRONG printed year must not close school.');
});

test('Unproven, negated, historical or next-week phrases never cancel school days',()=>{
 for(const sentence of [
  'Vi har ingen planleggingsdager torsdag og fredag.',
  'Skolen er ikke stengt torsdag.',
  'Planleggingsdag er avlyst torsdag.',
  'Forrige uke hadde vi planleggingsdager torsdag og fredag.',
  'Neste uke har skolen planleggingsdager torsdag og fredag.',
  'Planleggingsdag uten dato'
 ]){
  const records=extractSchoolClosuresFromPdf([source(sentence)],2026,45);
  assert.ok(records.every(x=>x.closedDays.length===0),JSON.stringify({sentence,records:compact(records)}));
 }
});

test('Daily packing never reappears on confirmed closed days through the family summary',()=>{
 const plan=planFor([timetable(),source('Denne uken er skolen stengt torsdag 05.november og fredag 6.november')]);
 plan.everyday=[{label:'Sekk'}];
 const profile={id:'fixture-0001',name:'Test',grade:'4',school:'nygaard',group:''};
 const cal={year:2026,week:45,weekday:3,today:'2026-11-05'};
 const summary=profileSummary(profile,plan,cal,()=>null);
 assert.equal(summary.ready,true);
 assert.equal(summary.todayBag.length,0,'No "everyday" items on Thursday when school is closed');
 assert.equal(summary.bag.length,0,'No "everyday" items on Friday when school is closed');
 assert.ok(summary.todayNotes.some(t=>/skolen stengt/i.test(t)));
 assert.ok(summary.weeklyBag.some(x=>x.day==='Hver dag'),'Normal week reminders remain for open days');
});

test('Weekly family highlights show the source-backed school closure once, not once per weekday',()=>{
 const original='Denne uken er skolen stengt torsdag 05.november og fredag 6.november';
 const plan=planFor([timetable(),source(original)]);
 const profile={id:'fixture-0001',name:'Test',grade:'4',school:'nygaard',group:''};
 const cal={year:2026,week:45,weekday:3,today:'2026-11-05',upcoming:false};
 const summary=profileSummary(profile,plan,cal,()=>null);
 const items=practicalHighlights({profiles:[profile],summaries:new Map([[profile.id,summary]]),
  plans:new Map([[profile.id,plan]]),calendar:cal,focus:'week'});
 const closures=items.filter(x=>x.kind==='notice'&&/skolen stengt/i.test(x.label));
 assert.equal(closures.length,1,'Global and Thursday/Friday day notices must not create three cards');
 assert.match(closures[0].label,/torsdag 5\. november og fredag 6\. november/i);
});
