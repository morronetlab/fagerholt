import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFamilyWeekAgenda} from '../public/shared/family-week-agenda.mjs';
import {familyAgendaMarkup,familyAgendaItemHtml} from '../public/shared/family-week-agenda-html.mjs';
import {profileSummary} from '../public/shared/family-core.mjs';

const calendar={year:2026,week:44,today:'2026-10-28',upcoming:false};
const red={id:'child-red-000001',name:'Barn Rød',school:'sjostrand',grade:'2',group:'Rød'};
const blue={id:'child-blue-00002',name:'Barn Blå',school:'sjostrand',grade:'2',group:'Blå'};
const pdf='https://www.minskole.no/DynamicContent/Documents/uke44.pdf';
const plan={status:'ok',parser:'ai',aiStatus:'ready',year:2026,week:44,pdf,
 source:'https://www.minskole.no/sjostrand/seksjon/22175',
 homework:[
  {subject:'Norsk',text:'Les sidene 20–24',dueDay:'Torsdag',group:'Rød'},
  {subject:'Matte',text:'Øv på gangetabellen',dueDay:null},
  {subject:'Engelsk',text:'Lær tre gloser',dueDay:'Fredag',group:'Blå'}
 ],notices:[],everyday:[],
 days:{Mandag:{bring:[],events:[]},Tirsdag:{bring:[],events:[]},
  Fredag:{bring:[{label:'Gymtøy',group:'Blå'}],events:[]}},
 dayNotes:{Tirsdag:[{text:'Vaksinasjon tirsdag: Husk samtykkeskjema.',group:'Rød'}]},
 provenance:[]};
const plans=new Map([[red.id,plan],[blue.id,plan]]);
const summaries=new Map([red,blue].map(p=>[p.id,profileSummary(p,plan,calendar)]));
const calendars=new Map([['sjostrand',{
 schoolId:'sjostrand',year:2026,week:44,sourceStatus:'snapshot',
 checkedAt:'2026-10-30',
 events:[{date:'2026-10-30',label:'Planleggingsdag – skolen stengt',schoolFree:true,
  sfoClosed:false,sfoStatus:'unknown'}]
}]]);
const activities=[
 {id:'family-one',title:'Felles middag',child_id:null,
  occurs_on:'2026-10-27',start_time:'17:30',repeat_rule:'none',repeat_until:null},
 {id:'red-sunday',title:'Korpskonsert',child_id:red.id,
  occurs_on:'2026-11-01',start_time:'13:00',repeat_rule:'none',repeat_until:null},
 {id:'blue-weekly',title:'Tennis',child_id:blue.id,
  occurs_on:'2026-10-21',start_time:'16:00',repeat_rule:'weekly',repeat_until:null}
];
const agenda=childId=>buildFamilyWeekAgenda({
 profiles:[red,blue],summaries,plans,calendars,activities,calendar,childId
});
test('Seven-day agenda combines PDF homework, reminders, municipal dates and weekend family activities',()=>{
 const result=agenda('');
 assert.deepEqual(result.days.map(x=>x.date),[
  '2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01']);
 const tuesday=result.days[1].items;
 assert.ok(tuesday.some(x=>x.kind==='school'&&/Vaksinasjon/.test(x.title)));
 assert.ok(tuesday.some(x=>x.kind==='family'&&/middag/.test(x.title)));
 assert.ok(result.days[3].items.some(x=>x.kind==='homework'&&/sidene 20/.test(x.title)));
 assert.ok(result.days[4].items.some(x=>x.kind==='municipal'&&/Planleggingsdag/.test(x.title)));
 assert.ok(result.days[6].items.some(x=>x.kind==='family'&&/Korpskonsert/.test(x.title)));
 assert.equal(result.days[5].date,'2026-10-31','Weekend is present even without school events');
 assert.ok(result.undated.some(x=>x.kind==='homework'&&/gangetabellen/.test(x.title)));
 assert.ok(result.undated.every(x=>x.date===null));
 assert.match(result.days[4].items.find(x=>x.kind==='municipal').details,/reserveversjon/);
 assert.equal(result.missingProfiles.length,0);
});
test('Child filter includes all-family activities and right school; never leaks sibling-specific work',()=>{
 const r=agenda(red.id),b=agenda(blue.id);
 const allRed=[...r.days.flatMap(d=>d.items),...r.undated];
 const allBlue=[...b.days.flatMap(d=>d.items),...b.undated];
 assert.ok(allRed.some(x=>/Felles middag/.test(x.title)));
 assert.ok(allBlue.some(x=>/Felles middag/.test(x.title)));
 assert.ok(allRed.some(x=>/Les sidene/.test(x.title)));
 assert.ok(!allBlue.some(x=>/Les sidene/.test(x.title)));
 assert.ok(allRed.some(x=>/Korpskonsert/.test(x.title)));
 assert.ok(!allBlue.some(x=>/Korpskonsert/.test(x.title)));
 assert.ok(allBlue.some(x=>/Tennis/.test(x.title)));
 assert.ok(!allRed.some(x=>/Tennis/.test(x.title)));
 assert.ok(allBlue.some(x=>/Lær tre gloser/.test(x.title)));
 assert.ok(!allRed.some(x=>/Lær tre gloser/.test(x.title)));
 assert.ok(allRed.some(x=>x.kind==='municipal'),'School calendar remains available under both siblings');
 assert.ok(allBlue.some(x=>x.kind==='municipal'));
 assert.ok(allRed.some(x=>/Vaksinasjon/.test(x.title)));
 assert.ok(!allBlue.some(x=>/Vaksinasjon/.test(x.title)));
});
test('Unready school plan is marked unavailable, never presented as no homework',()=>{
 const result=buildFamilyWeekAgenda({profiles:[red],summaries:new Map([
  [red.id,{ready:false,reason:'AI processing',tasks:[]}]]),
  plans:new Map([[red.id,{...plan,status:'partial',aiStatus:'processing'}]]),
  calendars,activities,calendar});
 assert.deepEqual(result.missingProfiles,['Barn Rød']);
 assert.ok(result.days[1].items.some(x=>x.kind==='family'));
 assert.ok(!result.days.some(day=>day.items.some(x=>x.kind==='homework')));
});
test('Output shows official PDF links and safely escapes user and AI text',()=>{
 const html=familyAgendaMarkup(agenda(''),{today:'2026-10-28'});
 assert.match(html.days,/Kilde: Skolens PDF/);
 assert.match(html.days,/https:\/\/www\.minskole\.no\/DynamicContent\/Documents\/uke44\.pdf/);
 assert.match(html.days,/Offisiell skolerute/);
 assert.match(html.days,/data-family-agenda-edit="red-sunday"/);
 assert.match(html.days,/Hele familien/);
 assert.match(html.undated,/Frist ikke oppgitt/);
 const injected=familyAgendaItemHtml({kind:'family',title:'<img src=x onerror=alert(1)>',
  details:'<script>bad</script>',scope:'<unsafe>',
  activityId:'abc" onclick="evil()',source:{url:'javascript:alert(1)'}});
 assert.doesNotMatch(injected,/<script>|<img |onclick=|href="javascript:/);
 assert.match(injected,/&lt;img/);
 assert.match(injected,/&lt;script&gt;/);
 assert.match(injected,/data-family-agenda-edit="abc&quot; onclick=&quot;evil\(\)"/);
});
test('Null or malformed calendar never invents an event date',()=>{
 assert.deepEqual(buildFamilyWeekAgenda({profiles:[red]}),{
  days:[],undated:[],missingProfiles:[],count:0});
});
