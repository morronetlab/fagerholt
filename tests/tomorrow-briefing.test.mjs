import test from 'node:test';
import assert from 'node:assert/strict';
import {nextIsoDate,nextSchoolIsoDate,buildTomorrowBriefing,selectBriefingDay} from '../public/shared/tomorrow-briefing.mjs';

const child={id:'one',name:'Ailin',school:'fagerholt',grade:'3'};
const emptyWeek=(year,week)=>({year,week});
const event=(date,kind,title,extra={})=>({key:kind+'-'+title,kind,title,date,
 scope:child.name,checked:false,...extra});

test('Tomorrow is the next real calendar day, including month, year and DST boundaries',()=>{
 assert.equal(nextIsoDate('2026-10-31'),'2026-11-01');
 assert.equal(nextIsoDate('2026-12-31'),'2027-01-01');
 assert.equal(nextIsoDate('2028-02-28'),'2028-02-29');
 assert.equal(nextIsoDate('2026-10-24'),'2026-10-25');
 assert.equal(nextIsoDate('2026-02-30'),null);
});
test('Thursday briefing combines verified Friday homework, school, activities and packing',()=>{
 const date='2026-10-30';
 const model={days:[{date,items:[
  event(date,'homework','Les 10 minutter',{checked:true}),
  event(date,'municipal','Skolefri'),event(date,'school','Husk turdag'),
  event(date,'family','Korps',{time:'17:30'})
 ]}]};
 const summaries=new Map([[child.id,{ready:true,todayIndex:3,nextIndex:4,
  todayBag:[],bag:[{label:'Drikkeflaske',checked:false}]}]]);
 const r=buildTomorrowBriefing({actualToday:'2026-10-29',
  calendar:emptyWeek(2026,44),agenda:model,profiles:[child],summaries});
 assert.equal(r.date,date);
 assert.equal(r.items.length,5);
 assert.deepEqual(r.items.map(x=>x.kind),['municipal','school','family','homework','packing']);
 assert.equal(r.completed,1);
 assert.match(r.items.at(-1).title,/Drikkeflaske/);
 assert.equal(r.hasMissing,false);
});
test('Sunday evening shows Monday tasks from next-week school plan, not fake Sunday deadlines',()=>{
 const date='2026-11-02';
 const r=buildTomorrowBriefing({actualToday:'2026-11-01',calendar:{
  year:2026,week:45,today:date,upcoming:true},profiles:[child],
  agenda:{days:[{date,items:[event(date,'homework','Les en bok')]}]},
  summaries:new Map([[child.id,{ready:true,todayIndex:0,nextIndex:1,
   todayBag:[{label:'Gymtøy',checked:false}],bag:[{label:'Ikke i morgen',checked:false}]}]])});
 assert.equal(r.inDisplayedWeek,true);
 assert.equal(r.weekend,false);
 assert.deepEqual(r.items.map(x=>x.title),['Les en bok','Pakk: Gymtøy']);
});
test('Friday afternoon never presents next Monday homework as Saturday tasks',()=>{
 const activity={id:'football',title:'Fotball',child_id:child.id,occurs_on:'2026-10-31',
  repeat_rule:'none',start_time:'12:00'};
 const model={days:[{date:'2026-11-02',items:[event('2026-11-02','homework','Mandagslekse')]}]};
 const r=buildTomorrowBriefing({actualToday:'2026-10-30',
  calendar:emptyWeek(2026,45),agenda:model,profiles:[child],summaries:new Map(),
  activities:[activity]});
 assert.equal(r.date,'2026-10-31');
 assert.equal(r.inDisplayedWeek,false);
 assert.equal(r.weekend,true);
 assert.deepEqual(r.items.map(x=>x.title),['Fotball']);
 assert.match(r.notice,/annen uke/);
});
test('If tomorrow school sources are missing, the briefing warns instead of claiming all clear',()=>{
 const r=buildTomorrowBriefing({actualToday:'2026-10-28',
  calendar:emptyWeek(2026,44),agenda:{days:[]},profiles:[child]});
 assert.equal(r.hasMissing,true);
 assert.match(r.notice,/Ukeplanen er ikke klar/);
 assert.equal(r.items.length,0);
});
test('Undated homework is never given an invented tomorrow date',()=>{
 const r=buildTomorrowBriefing({actualToday:'2026-10-28',
  calendar:emptyWeek(2026,44),agenda:{days:[],undated:[
   event(null,'homework','Uten innleveringsdato')
  ]},profiles:[child],summaries:new Map([[child.id,{
   ready:true,todayIndex:2,nextIndex:3,todayBag:[],bag:[]
  }]])});
 assert.equal(r.items.length,0);
});

test('Morning in Oslo uses today; at the school cutoff it switches to tomorrow',()=>{
 const select=iso=>selectBriefingDay(new Date(iso));
 assert.deepEqual(select('2026-11-03T06:35:00Z'),{
  actualToday:'2026-11-03',date:'2026-11-03',isToday:true});
 assert.equal(select('2026-11-03T13:59:00Z').isToday,true);
 assert.deepEqual(select('2026-11-03T14:00:00Z'),{
  actualToday:'2026-11-03',date:'2026-11-04',isToday:false});
 // Friday follows the family calendar's earlier 14:00 week rollover.
 assert.equal(select('2026-10-30T12:59:00Z').date,'2026-10-30');
 assert.equal(select('2026-10-30T13:00:00Z').date,'2026-11-02');
 // Oslo DST and day boundaries must not depend on UTC or device locale.
 assert.equal(select('2026-06-03T12:59:00Z').date,'2026-06-03');
 assert.equal(select('2026-06-03T13:00:00Z').date,'2026-06-04');
});
test('Morning briefing selects today tasks and packing; afternoon keeps tomorrow',()=>{
 const today='2026-11-03',tomorrow='2026-11-04';
 const agenda={days:[
  {date:today,items:[
   event(today,'school','Dagens besøk'),
   event(today,'family','Klarinett',{time:'16:00'}),
   event(today,'homework','Gjør norsklekser',{checked:true})
  ]},
  {date:tomorrow,items:[event(tomorrow,'school','Morgendagens besøk')]}
 ]};
 const summaries=new Map([[child.id,{ready:true,todayIndex:1,nextIndex:2,
  todayBag:[{label:'Matpakke',checked:false}],bag:[{label:'Gymtøy',checked:false}]}]]);
 const options={actualToday:today,calendar:emptyWeek(2026,45),agenda,profiles:[child],summaries};
 const morning=buildTomorrowBriefing({...options,targetDate:today});
 const afternoon=buildTomorrowBriefing({...options,targetDate:tomorrow});
 assert.equal(morning.isToday,true);
 assert.deepEqual(morning.items.map(x=>x.title),['Dagens besøk','Klarinett','Pakk: Matpakke']);
 assert.equal(morning.items.some(x=>x.title==='Morgendagens besøk'),false);
 assert.equal(morning.items.some(x=>x.kind==='homework'),false);
 assert.equal(morning.completed,0,'A completed homework must not affect today count');
 assert.equal(afternoon.isToday,false);
 assert.deepEqual(afternoon.items.map(x=>x.title),['Morgendagens besøk','Pakk: Gymtøy']);
});
test('Weekend morning previews Monday school tasks rather than Saturday activities',()=>{
 const childActivity={id:'sat',title:'Lørdagstur',child_id:child.id,occurs_on:'2026-10-31',
  repeat_rule:'none',start_time:'11:00'};
 const morning=selectBriefingDay(new Date('2026-10-31T07:00:00Z'));
 const result=buildTomorrowBriefing({actualToday:morning.actualToday,targetDate:morning.date,
  calendar:emptyWeek(2026,45),profiles:[child],activities:[childActivity]});
 assert.equal(result.isToday,false);
 assert.equal(morning.date,'2026-11-02');
 assert.deepEqual(result.items.map(x=>x.title),[]);
 assert.match(result.notice,/Ukeplanen er ikke klar/);
});

test('After Friday school and throughout the weekend, target next Monday',()=>{
 assert.equal(nextSchoolIsoDate('2026-11-06'),'2026-11-09');
 assert.equal(nextSchoolIsoDate('2026-11-07'),'2026-11-09');
 assert.equal(nextSchoolIsoDate('2026-11-08'),'2026-11-09');
 for(const iso of ['2026-11-06T13:00:00Z','2026-11-07T10:00:00Z','2026-11-08T10:00:00Z']){
  const result=selectBriefingDay(new Date(iso));
  assert.equal(result.date,'2026-11-09');
  assert.equal(result.isToday,false);
 }
});
