import test from 'node:test';
import assert from 'node:assert/strict';
import {nextIsoDate,buildTomorrowBriefing} from '../public/shared/tomorrow-briefing.mjs';

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
