import test from 'node:test';
import assert from 'node:assert/strict';
import {focusedFamilyCalendar} from '../public/shared/family-calendar-viewport.mjs';
import {familyAgendaMarkup} from '../public/shared/family-week-agenda-html.mjs';
import {buildFamilyWeekAgenda} from '../public/shared/family-week-agenda.mjs';
import {profileSummary} from '../public/shared/family-core.mjs';

const cal={year:2026,week:44,today:'2026-10-28',upcoming:false};
const p={id:'child-viewport-001',name:'Barn A',school:'sjostrand',grade:'2',group:'Rød'};
const plan={status:'ok',aiStatus:'ready',year:2026,week:44,
 pdf:'https://www.minskole.no/uke44.pdf',
 homework:[{text:'Les til torsdag',subject:'Norsk',dueDay:'Torsdag'}],
 everyday:[{label:'Gymtøy'}],
 days:{Tirsdag:{bring:[{label:'Svømmetøy'}],events:[]}},
 dayNotes:{Onsdag:[{text:'Vaksinasjon onsdag',group:'Rød'}]},
 notices:[{text:'Foreldremøte – tidspunkt kommer',group:'Rød'}],
 provenance:[]};
const activities=[
 {id:'one',title:'Tennis',child_id:p.id,occurs_on:'2026-10-28',start_time:'15:00',
  repeat_rule:'weekly',repeat_until:null},
 {id:'two',title:'Familieselskap på søndag',child_id:null,occurs_on:'2026-11-01',
  start_time:'12:00',repeat_rule:'none',repeat_until:null}
];
const source=()=>buildFamilyWeekAgenda({profiles:[p],
 summaries:new Map([[p.id,profileSummary(p,plan,cal)]]),
 plans:new Map([[p.id,plan]]),calendars:new Map(),activities,calendar:cal});
test('Default calendar is five weekdays and can reveal weekend event without losing data',()=>{
 const complete=source(),compact=focusedFamilyCalendar(complete);
 assert.equal(complete.days.length,7);
 assert.equal(compact.days.length,5);
 assert.deepEqual(compact.days.map(d=>d.weekday),['Mandag','Tirsdag','Onsdag','Torsdag','Fredag']);
 assert.equal(compact.weekendCount,1);
 assert.equal(compact.weekendVisible,false);
 assert.doesNotMatch(familyAgendaMarkup(compact).days,/Familieselskap på søndag/);
 const open=focusedFamilyCalendar(complete,{showWeekend:true});
 assert.equal(open.days.length,7);
 assert.equal(open.weekendVisible,true);
 assert.match(familyAgendaMarkup(open).days,/Familieselskap på søndag/);
 assert.equal(open.count,compact.count+1);
 assert.equal(source().days[6].items.length,1);
});
test('No duplicate homework or packing anywhere in school event cards or undated summary',()=>{
 const model=source(),all=[...model.days.flatMap(d=>d.items),...model.undated];
 assert.ok(all.some(e=>e.kind==='school'&&/Vaksinasjon/.test(e.title)));
 assert.ok(all.some(e=>e.kind==='school'&&/Foreldremøte/.test(e.title)));
 assert.ok(all.some(e=>e.kind==='family'&&/Tennis/.test(e.title)));
 assert.ok(all.every(e=>e.kind!=='homework'&&e.details!=='Husk utstyr'));
 const html=familyAgendaMarkup(focusedFamilyCalendar(model,{showWeekend:true}));
 assert.doesNotMatch(html.days+html.undated,/Gymtøy|Svømmetøy|Les til torsdag/);
 assert.match(html.days,/Kilde: Skolens PDF/);
 assert.match(html.days,/Lagt inn av familien/);
 assert.match(html.undated,/Foreldremøte/);
});
test('Weekend toggle is not offered if filtered family has no weekend events',()=>{
 const model=source(),weekend=focusedFamilyCalendar(model,{showWeekend:true});
 assert.equal(weekend.weekendCount,1);
 const withoutWeekend={...model,days:model.days.map((d,i)=>i<5?d:{...d,items:[]})};
 const empty=focusedFamilyCalendar(withoutWeekend,{showWeekend:true});
 assert.equal(empty.weekendVisible,false);
 assert.equal(empty.weekendCount,0);
 assert.equal(empty.days.length,5);
});
test('Missing plans preserve missing-profile warnings even when calendar has few events',()=>{
 const model=buildFamilyWeekAgenda({profiles:[p],summaries:new Map([[p.id,{ready:false,tasks:[]}]]),
  plans:new Map(),calendars:new Map(),activities:[],calendar:cal});
 const visible=focusedFamilyCalendar(model);
 assert.deepEqual(visible.missingProfiles,['Barn A']);
 assert.equal(visible.days.length,5);
 assert.equal(visible.count,0);
});
