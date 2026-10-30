import test from 'node:test';
import assert from 'node:assert/strict';
import {practicalHighlights} from '../public/shared/practical-highlights.mjs';

const profile={id:'child-test-1234',name:'Barn A',school:'fagerholt',grade:'3',group:'Rød gruppe'};
const other={id:'child-test-5678',name:'Barn B',school:'fagerholt',grade:'3',group:'Blå gruppe'};
const calendar={year:2026,week:44,today:'2026-10-28',upcoming:false};
const summary={
 ready:true,
 tasks:[{text:'Les 15 minutter',subject:'Norsk',checked:false}],
 todayBag:[],bag:[{label:'Badetøy',checked:false}],
 todayNotes:[],notices:['Foreldremøte torsdag kl. 18'],
 weeklyBag:[{label:'Penal',day:'Hver dag',checked:false},
  {label:'Badetøy',day:'Torsdag',checked:false},
  {label:'Gymtøy',day:'Fredag',checked:false}],
 weeklyNotices:[{day:'Hele uka',text:'Husk påmelding til tur'},
  {day:'Torsdag',text:'Foreldremøte torsdag kl. 18'}]
};
const plan={
 year:2026,week:44,status:'ok',aiStatus:'ready',
 homework:[{text:'Les 15 minutter',subject:'Norsk'}],
 days:{Torsdag:{events:[{title:'Svømming i bassenget',time:'09:00'},
   {title:'Skolearbeid',time:'10:00'}]},Fredag:{events:[{title:'Skolearbeid'}]}},
 attendance:[{day:'Torsdag',time:'08:15',text:'Ved svømmehallen',group:'Rød gruppe'}]
};
const view=(p=profile,s=summary,pl=plan,cal=calendar,focus='week')=>
 practicalHighlights({profiles:[p],summaries:new Map([[p.id,s]]),
  plans:new Map([[p.id,pl]]),calendar:cal,focus});

test('Family practical list omits all homework, everyday pencil and ordinary lessons',()=>{
 const items=view();
 assert.ok(items.some(i=>/Badetøy/.test(i.label)));
 assert.ok(items.some(i=>/Svømming/.test(i.label)));
 assert.ok(items.some(i=>/Foreldremøte/.test(i.label)));
 assert.ok(items.some(i=>/særskilt oppmøte/.test(i.label)));
 assert.ok(!items.some(i=>/Les 15 minutter|Penal|Skolearbeid/.test(i.label)));
 assert.ok(items.every(x=>['gear','event','notice'].includes(x.kind)));
});
test('Daily practical lists are scoped to the chosen day and group',()=>{
 const thursday={...calendar,today:'2026-10-29'};
 const daily=view(profile,summary,plan,thursday,'today');
 assert.ok(daily.some(x=>/Svømming/.test(x.label)));
 assert.ok(daily.some(x=>/særskilt oppmøte/.test(x.label)));
 const otherGroup=view(other,summary,plan,thursday,'today');
 assert.ok(!otherGroup.some(x=>/særskilt oppmøte/.test(x.label)));
 const weekly=view(profile,summary,plan,calendar,'week');
 assert.ok(weekly.length>=daily.length);
});
test('Do not invent highlights from a missing or stale PDF',()=>{
 assert.deepEqual(view(profile,{...summary,ready:false}),[]);
 assert.deepEqual(view(profile,summary,{...plan,week:43}),[]);
 assert.deepEqual(view(profile,summary,null),[]);
});
test('Highlights keep source wording intact even when notices are long',()=>{
 const long='Ta med spesialutstyr til turdagen, merket med navn, før klokken 08.15. '.repeat(5);
 const s={...summary,weeklyBag:[],weeklyNotices:[{day:'Mandag',text:long}]};
 assert.equal(view(profile,s,plan).find(x=>x.kind==='notice').label,'Mandag: '+long.trim());
});
