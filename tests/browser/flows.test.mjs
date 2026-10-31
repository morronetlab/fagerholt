/** Real Chromium smoke tests with mocked school APIs; no live school data or API cost. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {schoolCalendar,familyWeekCalendar} from '../../public/shared/calendar.mjs';

const DAYS=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
const TEST_WEDNESDAY='2026-10-28T10:00:00Z';
let browser,server;
before(async()=>{server=await startStaticServer();browser=await chromium.launch({headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();await server?.close();});

const basePlan=grade=>{
 const days=Object.fromEntries(DAYS.map(d=>[d,{events:[{title:'Skolearbeid',time:'08:30'}],bring:[]}]));
 if(grade==='2')days.Fredag.bring=[{label:'Gymsko'}];
 return {
  grade,week:44,year:2026,source:'https://www.minskole.no/sjostrand/seksjon/22175',
  pdf:'https://www.minskole.no/DynamicContent/Documents/uke44.pdf',
  status:'ok',parser:'ai',aiStatus:'ready',homeworkSourceVersion:1,days,
  dayNotes:grade==='2'?{Onsdag:[{text:'Vaksine onsdag morgen.'}]}:{},
  everyday:[],attendance:[],subjects:[],learningGoals:[],notices:[],contacts:[],specialContent:[],
  homework:grade==='2'?
   [{text:'Les minst 10 min. i heftet ditt/ boka di!',subject:'Norsk'},
    {text:'Les teksten og svar på spørsmålene',subject:'Norsk'}]:[],
  vocabulary:grade==='5A'?[{category:'Engelske gloser',text:'apple - eple\nbanana - banan\npear - pære'}]:[],
  weekTheme:null,optionalMission:null
 };
};
const reply=(route,json)=>route.fulfill({status:200,contentType:'application/json; charset=utf-8',body:JSON.stringify(json)});
async function openPage(t,{width=1280,height=850,processing=false,mockNow=TEST_WEDNESDAY}={}){
 const context=await browser.newContext({viewport:{width,height},locale:'nb-NO',timezoneId:'Europe/Oslo'});
 t.after(()=>context.close());
 const page=await context.newPage();
 await page.addInitScript(iso=>{
  const NativeDate=Date,stamp=new NativeDate(iso).getTime();
  class FixedDate extends NativeDate{
   constructor(...args){if(args.length)super(...args);else super(stamp);}
   static now(){return stamp;}
  }
  window.Date=FixedDate;
 },mockNow);
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/grades?**',route=>reply(route,{grades:[{code:'2'},{code:'5A'}]}));
 await page.route('**/api/plan?**',route=>{
  const grade=new URL(route.request().url()).searchParams.get('grade');
  const plan=basePlan(grade);
  if(processing){plan.aiStatus='processing';plan.status='partial';}
  return reply(route,plan);
 });
 await page.route('**/api/weather?**',route=>reply(route,{days:{},locationLabel:'Sjøstrand'}));
 await page.goto(server.baseURL+'/',{waitUntil:'domcontentloaded'});
 return {page,errors};
}
async function chooseSchoolGrade(page,grade){
 if(await page.locator('#welcome-view').isVisible())await page.locator('#landing-open-plan').click();
 await page.locator('#school-search').fill('Sjøstrand');
 await page.locator('[data-school="sjostrand"]').click();
 await page.locator('[data-grade="'+grade+'"]').click();
 await page.locator('#school-name').waitFor({state:'visible'});
}
test('New landing presents a family-first choice and keeps guest access visible',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await page.locator('#welcome-view').waitFor({state:'visible'});
 assert.match(await page.locator('#welcome-title').innerText(),/Hele familiens skoleuke/);
 assert.equal(await page.locator('#landing-create-family').isVisible(),true);
 assert.equal(await page.locator('#landing-open-plan').isVisible(),true);
 assert.equal(await page.locator('#school-gate').isVisible(),false);
 await page.locator('#landing-open-plan').click();
 assert.equal(await page.locator('#school-gate').isVisible(),true);
 assert.equal(await page.locator('#nav-plan').getAttribute('aria-current'),'page');
 await page.locator('#school-back').click();
 assert.equal(await page.locator('#welcome-view').isVisible(),true);
 assert.deepEqual(errors,[]);
});

test('School and grade selection remains available after navigating home and back',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await chooseSchoolGrade(page,'2');
 await page.locator('#homework-list .checkrow').first().waitFor();
 assert.match(await page.locator('#plan-context-class').innerText(),/Sjøstrand.*2/);
 await page.locator('#nav-home').click();
 assert.equal(await page.locator('#welcome-view').isVisible(),true);
 await page.locator('#nav-plan').click();
 assert.equal(await page.locator('#app-view').isVisible(),true);
 await page.locator('#mobile-selection-menu summary').click();
 await page.locator('#mobile-change-grade').click();
 assert.equal(await page.locator('#grade-gate').isVisible(),true);
 await page.locator('#grade-back').click();
 assert.equal(await page.locator('#school-gate').isVisible(),true);
 assert.deepEqual(errors,[]);
});

test('Local family entry and account CTA can both start from the new welcome screen',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await page.locator('#landing-local-family').click();
 assert.equal(await page.locator('#family-view').isVisible(),true);
 assert.equal(await page.locator('#family-form').isVisible(),true);
 await page.locator('#nav-home').click();
 assert.equal(await page.locator('#welcome-view').isVisible(),true);
 await page.locator('#landing-create-family').click();
 assert.equal(await page.locator('#account-panel').isVisible(),true);
 assert.deepEqual(errors,[]);
});

test('English-to-Norwegian quiz appears for Sjøstrand 5A and validates meaning in a browser',async t=>{
 const {page,errors}=await openPage(t);
 await chooseSchoolGrade(page,'5A');
 await page.locator('#word-quiz').waitFor({state:'visible'});
 assert.match(await page.locator('#vocabulary-title').textContent(),/Engelske gloser/);
 await page.locator('#word-quiz-start').click();
 assert.match(await page.locator('#word-quiz-question').textContent(),/apple/);
 assert.equal(await page.locator('#vocabulary-list').isVisible(),false);
 await page.locator('#word-quiz-answer').fill('eple');
 await page.locator('#word-quiz-form button[type=submit]').click();
 assert.match(await page.locator('#word-quiz-feedback').textContent(),/Riktig/);
 await page.locator('#word-quiz-next').click();
 assert.match(await page.locator('#word-quiz-question').textContent(),/banana/);
 assert.deepEqual(errors,[]);
});
test('Sjøstrand 2 displays practical vaccine and packing information, with correct helper eligibility',async t=>{
 const {page,errors}=await openPage(t);
 await chooseSchoolGrade(page,'2');
 await page.locator('#homework-list .checkrow').first().waitFor();
 assert.equal(await page.locator('#homework-list .checkrow').count(),2);
 assert.equal(await page.locator('#homework-list .helper-open').count(),1);
 assert.doesNotMatch(await page.locator('#homework-list').innerText(),/vaksine|gymsko/i);
 await page.locator('#day-buttons [data-day="2"]').click();
 assert.match(await page.locator('#day-notes-list').innerText(),/vaksine/i);
 await page.locator('#day-buttons [data-day="4"]').click();
 assert.match(await page.locator('#bag-list').innerText(),/gymsko/i);
 await page.locator('#homework-list input[type="checkbox"]').first().check();
 assert.match(await page.locator('#homework-progress-count').textContent(),/1 av 2/);
 await page.reload();
 await page.locator('#homework-list input[type="checkbox"]').first().waitFor();
 assert.equal(await page.locator('#homework-list input[type="checkbox"]').first().isChecked(),true);
 assert.deepEqual(errors,[]);
});
test('Mobile school selection and changing class work at 390px viewport',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await chooseSchoolGrade(page,'5A');
 await page.locator('#word-quiz').waitFor({state:'visible'});
 await page.locator('#mobile-selection-menu summary').click();
 await page.locator('#mobile-change-grade').click();
 await page.locator('[data-grade="2"]').click();
 await page.locator('#homework-list .checkrow').first().waitFor();
 assert.equal(await page.locator('#word-quiz').isVisible(),false);
 assert.equal(await page.locator('#homework-list .checkrow').count(),2);
 assert.deepEqual(errors,[]);
});
test('AI processing displays a transparent loading state rather than pretending the plan is ready',async t=>{
 const {page,errors}=await openPage(t,{processing:true});
 await chooseSchoolGrade(page,'5A');
 await page.locator('#plan-feedback').waitFor({state:'visible'});
 // Feedback becomes visible before its asynchronous AI progress panel; wait
 // for the actual processing state instead of racing the browser render.
 await page.locator('#analysis-progress').waitFor({state:'visible'});
 assert.equal(await page.locator('#plan-body').isVisible(),false);
 assert.match(await page.locator('#status-pill').textContent(),/AI analyserer/);
 assert.deepEqual(errors,[]);
});

test('Practice remembers wrong answers, resumes on reload and pauses on mobile',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await chooseSchoolGrade(page,'5A');
 await page.locator('#word-quiz-start').click();
 await page.locator('#word-quiz-answer').fill('banan');
 await page.locator('#word-quiz-form button[type=submit]').click();
 assert.match(await page.locator('#word-quiz-feedback').textContent(),/øver mer/);
 await page.reload();
 await page.locator('#word-quiz-start').waitFor({state:'visible'});
 assert.match(await page.locator('#word-quiz-start').textContent(),/Fortsett/);
 await page.locator('#word-quiz-start').click();
 assert.match(await page.locator('#word-quiz-feedback').textContent(),/øver mer/);
 await page.locator('#word-quiz-next').click();
 assert.match(await page.locator('#word-quiz-question').textContent(),/banana/);
 await page.locator('#word-quiz-pause').click();
 assert.match(await page.locator('#word-quiz-start').textContent(),/Fortsett/);
 assert.equal(await page.locator('#word-quiz-stat-weak').textContent(),'1');
 assert.deepEqual(errors,[]);
});

test('English and Norwegian words get separate responsive quiz cards',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await page.route('**/api/plan?**',route=>{
  const grade=new URL(route.request().url()).searchParams.get('grade');
  const plan=basePlan(grade);
  plan.vocabulary=[{category:'Engelske gloser',text:'team - lag\nforward - spiss\nmanager - trener'},
   {category:'Norske øveord',text:'overskrift\nlykkelig\ntrist'}];
  return reply(route,plan);
 });
 await chooseSchoolGrade(page,'5A');
 await page.locator('#vocabulary-panel').waitFor({state:'visible'});
 await page.locator('#vocabulary-panel-nb').waitFor({state:'visible'});
 assert.match(await page.locator('#vocabulary-list').innerText(),/team/);
 assert.doesNotMatch(await page.locator('#vocabulary-list').innerText(),/overskrift/);
 assert.match(await page.locator('#vocabulary-list-nb').innerText(),/overskrift/);
 assert.doesNotMatch(await page.locator('#vocabulary-list-nb').innerText(),/team/);
 const padding=await page.locator('#vocabulary-list-nb').evaluate(el=>parseFloat(getComputedStyle(el).paddingLeft));
 assert.ok(padding>=16,'Word list has a visible left margin');
 await page.locator('#word-quiz-start-nb').click();
 assert.match(await page.locator('#word-quiz-question-nb').textContent(),/fire sekunder/);
 await page.locator('#word-quiz-pause-nb').click();
 await page.locator('#word-quiz-start').click();
 assert.match(await page.locator('#word-quiz-question').textContent(),/team/);
 assert.deepEqual(errors,[]);
});
test('Homework help dialog is clear and restores focus after closing',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await chooseSchoolGrade(page,'2');
 const button=page.locator('#homework-list .helper-open').first();
 await button.click();
 assert.equal(await page.locator('#helper-modal').isVisible(),true);
 assert.match(await page.locator('#helper-title').textContent(),/Du klarer dette/);
 assert.equal(await page.locator('[data-helper-mode]').count(),2);
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#helper-modal').isVisible(),false);
 assert.equal(await button.evaluate(el=>document.activeElement===el),true);
 assert.deepEqual(errors,[]);
});

async function addFamilyChild(page,name,grade='2'){
 await page.locator('#family-add').click();
 await page.locator('#family-name').fill(name);
 await page.locator('#family-school').selectOption('sjostrand');
 await page.locator('#family-grade option[value="'+grade+'"]').waitFor({state:'attached'});
 await page.locator('#family-grade').selectOption(grade);
 await page.locator('#family-save').click();
 await page.locator('#family-cards .family-child').filter({hasText:name}).waitFor();
}
test('V2 family overview combines two children and keeps completion independently',async t=>{
 // Friday before the family dashboard cutoff: homework due Friday is visible
 // in the "I dag" checklist, so it can be checked and unchecked per child.
 const {page,errors}=await openPage(t,{width:390,height:844,mockNow:'2026-10-30T12:00:00Z'});
 const current=schoolCalendar(new Date(TEST_WEDNESDAY),'Europe/Oslo');
 await page.route('**/api/plan?**',route=>{
  const grade=new URL(route.request().url()).searchParams.get('grade');
  const plan=basePlan(grade);
  plan.week=current.week;plan.year=current.year;
  plan.homework=[{text:'Les en bok fra skolen',subject:'Norsk',dueDay:'Fredag'},
   {text:'Skriv et sammendrag',subject:'Norsk',dueDay:'Torsdag'}];
  plan.days.Fredag.bring=[{label:'Gymtøy'}];
  return reply(route,plan);
 });
 await page.locator('#family-toggle').click();
 assert.equal(await page.locator('#family-view').isVisible(),true);
 await addFamilyChild(page,'Barn A');
 await addFamilyChild(page,'Barn B');
 assert.equal(await page.locator('#family-cards .family-child').count(),2);
 assert.equal(await page.locator('#family-reminders').isVisible(),true);
 await page.locator('[data-family-focus="week"]').click();
 assert.equal(await page.locator('[data-family-focus="week"]').getAttribute('aria-pressed'),'true');
 assert.match(await page.locator('#family-reminders').innerText(),/Gymtøy/);
 assert.doesNotMatch(await page.locator('#family-reminders').innerText(),/Les en bok fra skolen/);
 await page.locator('[data-family-focus="today"]').click();
 assert.equal(await page.locator('[data-family-focus="today"]').getAttribute('aria-pressed'),'true');
 await page.locator('#family-cards [data-family-open]').first().click();
 await page.locator('#homework-list input[type=checkbox]').first().waitFor();
 await page.locator('#homework-list input[type=checkbox]').first().check();
 await page.locator('#family-toggle').click();
 await page.locator('#family-cards .family-child').first().locator('.family-child-progress').waitFor();
 assert.match(await page.locator('#family-cards .family-child').first().locator('.family-child-progress').innerText(),/1 \/ 2/);
 assert.match(await page.locator('#family-cards .family-child').nth(1).locator('.family-child-progress').innerText(),/0 \/ 2/);
 await page.locator('#family-cards .family-child').nth(1).locator('input[data-family-check]').first().check();
 assert.match(await page.locator('#family-cards .family-child').nth(1).locator('.family-child-progress').innerText(),/1 \/ 2/);
 await page.locator('#family-cards .family-child').first().locator('input[data-family-index="0"]').uncheck();
 assert.match(await page.locator('#family-cards .family-child').first().locator('.family-child-progress').innerText(),/0 \/ 2/);
 assert.match(await page.locator('#family-cards .family-child').nth(1).locator('.family-child-progress').innerText(),/1 \/ 2/);
 await page.reload();
 await page.locator('#family-cards .family-child').nth(1).waitFor();
 assert.equal(await page.locator('#family-cards .family-child').count(),2);
 assert.deepEqual(errors,[]);
});
test('Family overview starts PDF AI once per class and automatically updates both children when cached',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 const now=schoolCalendar(new Date(TEST_WEDNESDAY),'Europe/Oslo');
 const profiles=[{id:'child-ai-000001',name:'Barn A',school:'sjostrand',grade:'2',group:''},
  {id:'child-ai-000002',name:'Barn B',school:'sjostrand',grade:'2',group:''}];
 await page.evaluate(value=>localStorage.setItem('ukeplanen.family.v2',JSON.stringify({version:2,profiles:value})),profiles);
 let fullRequests=0,statusRequests=0;
 await page.route('**/api/plan?**',route=>{
  fullRequests++;
  const data={...basePlan('2'),week:now.week,year:now.year};
  if(fullRequests===1)return reply(route,{...data,status:'partial',parser:'rules',
   aiStatus:'processing',jobId:'test-ai-handle',parsedFromPdf:false,homework:[]});
  return reply(route,{...data,status:'ok',parser:'ai',aiStatus:'ready',homeworkSourceVersion:1});
 });
 await page.route('**/api/ai-status?**',route=>{
  statusRequests++;
  return reply(route,{aiStatus:'ready',status:'ok',parser:'ai',homeworkSourceVersion:1});
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#family-view').waitFor({state:'visible'});
 await page.locator('#family-cards .family-child-progress').first().waitFor({state:'visible',timeout:20000});
 assert.equal(await page.locator('#family-cards .family-child-progress').count(),2);
 assert.equal(fullRequests,2,'One initial check and one final source-verified read per school/grade');
 assert.equal(statusRequests,1,'One AI job is polled for both siblings');
 assert.match(await page.locator('#family-cards .family-ai-label').first().innerText(),/lagret/);
 assert.deepEqual(errors,[]);
});

test('Family rechecks the PDF on a new visit and follows replacement AI jobs automatically',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 const now=schoolCalendar(new Date(),'Europe/Oslo');
 await page.evaluate(()=>localStorage.setItem('ukeplanen.family.v2',JSON.stringify({
  version:2,profiles:[{id:'child-ai-000003',name:'Barn A',school:'sjostrand',grade:'2',group:''}]
 })));
 let fullRequests=0,statusRequests=0;
 await page.route('**/api/plan?**',route=>{
  fullRequests++;
  const data={...basePlan('2'),year:now.year,week:now.week,pdf:'https://www.minskole.no/DynamicContent/Documents/new-weekplan.pdf'};
  if(fullRequests<3)return reply(route,{...data,parser:'rules',status:'partial',
    aiStatus:'processing',jobId:fullRequests===1?'job-old-pdf':'job-new-pdf',homework:[]});
  return reply(route,{...data,parser:'ai',status:'ok',aiStatus:'ready',homeworkSourceVersion:1});
 });
 await page.route('**/api/ai-status?**',route=>{
  statusRequests++;
  return reply(route,{aiStatus:'ready',parser:'ai',status:'ok',homeworkSourceVersion:1});
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#family-cards .family-child-progress').first().waitFor({state:'visible',timeout:25000});
 assert.equal(fullRequests,3,'A replaced PDF triggers another background job before the canonical ready result');
 assert.equal(statusRequests,2);
 assert.deepEqual(errors,[]);
});

test('Friday after school shows only next-week PDF status for each child, never the finished week',async t=>{
 const friday='2026-10-30T13:05:00Z'; // Friday 14:05 in Oslo
 const shown=familyWeekCalendar(new Date(friday),'Europe/Oslo');
 const current=schoolCalendar(new Date(friday),'Europe/Oslo');
 const {page,errors}=await openPage(t,{width:390,height:844,mockNow:friday});
 await page.evaluate(()=>localStorage.setItem('ukeplanen.family.v2',JSON.stringify({
  version:2,profiles:[
   {id:'child-week-0001',name:'Barn A',school:'sjostrand',grade:'2',group:''},
   {id:'child-week-0002',name:'Barn B',school:'sjostrand',grade:'2',group:''}]
 })));
 const urls=[];
 await page.route('**/api/plan?**',route=>{
  const url=new URL(route.request().url());urls.push(url.search);
  if(!url.searchParams.has('nextWeek')){
   return reply(route,{...basePlan('2'),year:current.year,week:current.week,status:'ok',
    homework:[{subject:'Norsk',text:'GAMMEL UKE: skal ikke vises',dueDay:'Fredag'}]});
  }
  return reply(route,{...basePlan('2'),year:shown.year,week:shown.week,status:'unpublished',
   pdf:null,homework:[],aiStatus:'disabled'});
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#family-cards .family-not-ready').first().waitFor({state:'visible'});
 assert.match(await page.locator('#family-week').innerText(),new RegExp('Uke '+shown.week));
 assert.equal(await page.locator('.family-child-week').count(),2);
 assert.match(await page.locator('.family-child-week').first().innerText(),new RegExp('UKE '+shown.week));
 assert.match(await page.locator('#family-cards').innerText(),new RegExp('Ukeplan for uke '+shown.week+' er ikke tilgjengelig ennå'));
 assert.equal(await page.locator('#family-cards .family-child-progress').count(),0);
 assert.equal(await page.locator('.family-focus-tabs').isVisible(),false);
 assert.match(await page.locator('#family-week-progress').innerText(),/Avventer ukeplan/);
 assert.doesNotMatch(await page.locator('#family-view').innerText(),/GAMMEL UKE/);
 assert.ok(urls.length>=1&&urls.every(x=>x.includes('nextWeek=1')),
  'Only the next-week PDF must be requested by family overview');
 await page.locator('#family-cards [data-family-open]').first().click();
 await page.locator('#app-view').waitFor({state:'visible'});
 assert.match(await page.locator('#week-label').innerText(),new RegExp('UKE '+shown.week));
 assert.equal(await page.locator('#back-this-week').isVisible(),false,
  'Opening a child cannot jump backwards to the finished school week');
 assert.deepEqual(errors,[]);
});

test('Next-week family dashboard shows new weekly tasks with the correct week on Saturday',async t=>{
 const saturday='2026-10-31T12:00:00Z',shown=familyWeekCalendar(new Date(saturday),'Europe/Oslo');
 const {page,errors}=await openPage(t,{width:390,height:844,mockNow:saturday});
 await page.evaluate(()=>localStorage.setItem('ukeplanen.family.v2',JSON.stringify({
  version:2,profiles:[{id:'child-week-0003',name:'Barn A',school:'sjostrand',grade:'2',group:''}]
 })));
 await page.route('**/api/plan?**',route=>{
  const query=new URL(route.request().url()).searchParams;
  assert.equal(query.get('nextWeek'),'1');
  const plan=basePlan('2');plan.year=shown.year;plan.week=shown.week;
  plan.homework=[{subject:'Norsk',text:'Les til mandag NESTE UKE',dueDay:'Mandag'}];
  plan.days.Mandag.bring=[{label:'Gymtøy for neste uke'}];
  plan.aiStatus='ready';plan.status='ok';
  return reply(route,plan);
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#family-cards .family-child-progress').waitFor({state:'visible'});
 assert.match(await page.locator('#family-cards').innerText(),/Lekser i uke/);
 assert.match(await page.locator('#family-cards').innerText(),/Les til mandag NESTE UKE/);
 assert.match(await page.locator('#family-reminders').innerText(),/Gymtøy for neste uke/);
 assert.match(await page.locator('.family-child-week').innerText(),new RegExp('UKE '+shown.week));
 assert.doesNotMatch(await page.locator('#family-view').innerText(),/I dag/);
 assert.deepEqual(errors,[]);
});

test('Before Friday 14:00 Oslo the family overview still uses the current week',async t=>{
 const before='2026-10-30T12:59:00Z',now=schoolCalendar(new Date(before),'Europe/Oslo');
 const {page,errors}=await openPage(t,{mockNow:before});
 await page.evaluate(()=>localStorage.setItem('ukeplanen.family.v2',JSON.stringify({
  version:2,profiles:[{id:'child-week-0004',name:'Barn A',school:'sjostrand',grade:'2',group:''}]
 })));
 const requested=[];
 await page.route('**/api/plan?**',route=>{
  const query=new URL(route.request().url()).searchParams;
  requested.push(query.get('nextWeek'));
  const plan=basePlan('2');plan.year=now.year;plan.week=now.week;
  return reply(route,plan);
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#family-cards .family-child-progress').waitFor({state:'visible'});
 assert.equal(await page.locator('.family-focus-tabs').isVisible(),true);
 assert.equal(requested.every(x=>x===null),true);
 assert.match(await page.locator('.family-child-week').innerText(),new RegExp('UKE '+now.week));
 assert.deepEqual(errors,[]);
});

test('Practical overview limits notices to five, expands without an AI call, and never lists homework',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await page.evaluate(()=>localStorage.setItem('ukeplanen.family.v2',JSON.stringify({
  version:2,profiles:[{id:'child-prac-0001',name:'Barn A',school:'sjostrand',grade:'2',group:''}]
 })));
 let planRequests=0;
 await page.route('**/api/plan?**',route=>{
  planRequests++;
  const p=basePlan('2');
  p.notices=Array.from({length:9},(_,i)=>'Viktig praktisk beskjed nr '+(i+1));
  p.homework=[{subject:'Norsk',text:'DETTE ER BARE LEKSER',dueDay:'Torsdag'}];
  return reply(route,p);
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('[data-family-focus="week"]').click();
 await page.locator('.family-reminder').first().waitFor({state:'visible'});
 assert.equal(await page.locator('.family-reminder').count(),5);
 assert.match(await page.locator('#family-reminders-more').innerText(),/Vis alle/);
 const requestsBefore=planRequests;
 const count=Number((await page.locator('#family-reminders-more').innerText()).match(/\d+/)?.[0]);
 assert.ok(count>=9,'At least the nine test notices must be counted');
 await page.locator('#family-reminders-more').click();
 assert.equal(await page.locator('.family-reminder').count(),count);
 assert.equal(planRequests,requestsBefore,'Expanding notices must not fetch a PDF or invoke AI');
 assert.doesNotMatch(await page.locator('#family-reminders').innerText(),/DETTE ER BARE LEKSER/);
 await page.locator('#family-reminders-more').click();
 assert.equal(await page.locator('.family-reminder').count(),5);
 assert.deepEqual(errors,[]);
});

test('Family AI ranks advance preparations first, visually highlights them, and never blocks the plan',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await page.evaluate(()=>localStorage.setItem('ukeplanen.family.v2',JSON.stringify({
  version:2,profiles:[{id:'child-ai-priority-001',name:'Barn A',school:'sjostrand',grade:'2',group:''}]
 })));
 let planCalls=0,rankCalls=0;
 const important='Svarfrist for å melde seg på leirskole er mandag';
 await page.route('**/api/plan?**',route=>{
  planCalls++;
  const p=basePlan('2');
  p.practicalPriorityToken='signed-document-token';
  p.createdAt='2026-10-28T09:00:00.000Z';
  p.notices=['Husk at det er vanlig skoledag',important,
   'Torsdag kan elevene se en forestilling'];
  return reply(route,p);
 });
 await page.route('**/api/practical-priority?**',route=>{
  rankCalls++;
  const scores={
   ['notice|'+important.toLocaleLowerCase('nb-NO')]:
    {importance:3,prepareAhead:true},
   'notice|husk at det er vanlig skoledag':{importance:0,prepareAhead:false}
  };
  return reply(route,{status:'ready',scores});
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#family-cards .family-child-progress').waitFor({state:'visible'});
 await page.locator('[data-family-focus="week"]').click();
 await page.locator('.family-reminder-priority').filter({hasText:important})
  .waitFor({state:'visible',timeout:15000});
 const reminders=await page.locator('.family-reminder').allInnerTexts();
 const importantIndex=reminders.findIndex(item=>item.includes(important));
 const routineIndex=reminders.findIndex(item=>item.includes('Husk at det er vanlig skoledag'));
 assert.ok(importantIndex>=0&&routineIndex>=0&&importantIndex<routineIndex,
  'AI planning deadline must outrank routine messages; vaccination may rank even higher');
 assert.match(await page.locator('.family-reminder-priority').filter({hasText:important}).innerText(),
  /Forbered i forkant/);
 assert.equal(rankCalls,1);
 assert.equal(planCalls,1,'Ranking must not re-download or re-interpret PDF');
 await page.locator('#family-cards [data-family-open]').first().click();
 assert.equal(await page.locator('#plan-body').isVisible(),true,'No loading page while AI ranks');
 assert.equal(planCalls,1,'Opening a verified plan is still instant');
 assert.deepEqual(errors,[]);
});

test('Family workday changes and vaccinations outrank homework and even conflicting AI scores',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await page.evaluate(()=>localStorage.setItem('ukeplanen.family.v2',JSON.stringify({
  version:2,profiles:[{id:'adult-impact-0001',name:'Barn',school:'sjostrand',grade:'2',group:''}]
 })));
 let ranks=0,planRequests=0;
 await page.route('**/api/plan?**',route=>{
  planRequests++;
  const p=basePlan('2');
  p.practicalPriorityToken='signed-pdf-token';
  p.createdAt='2026-10-28T08:00:00.000Z';
  p.days.Mandag.events=[{title:'Planleggingsdag – elevene har fri',time:null}];
  p.days.Tirsdag.events=[{title:'Vanlig matematikk',time:'08:30'}];
  p.days.Onsdag.events=[{title:'Vaksine ved helsesykepleier',time:null}];
  p.days.Torsdag.events=[{title:'Svømming',time:'09:00'}];
  p.days.Fredag.events=[{title:'SFO er stengt',time:null}];
  p.notices=['Husk at dette er en vanlig skoleuke'];
  p.homework=[{subject:'Norsk',text:'Les 15 minutter'}];
  return reply(route,p);
 });
 await page.route('**/api/practical-priority?**',route=>{
  ranks++;
  return reply(route,{status:'ready',scores:{
   'event|mandag: planleggingsdag – elevene har fri':{importance:0,prepareAhead:false},
   'event|fredag: sfo er stengt':{importance:0,prepareAhead:false},
   'event|onsdag: vaksine ved helsesykepleier':{importance:0,prepareAhead:false},
   'notice|husk at dette er en vanlig skoleuke':{importance:3,prepareAhead:true},
   'event|torsdag: svømming kl. 09:00':{importance:3,prepareAhead:true}
  }});
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#family-cards .family-child-progress').waitFor({state:'visible'});
 // The default "Neste skoledag" tab must not hide an upcoming Friday SFO closure.
 await page.locator('.family-reminder-workday').first().waitFor({state:'visible'});
 assert.match(await page.locator('#family-reminders').innerText(),/SFO er stengt/);
 assert.match(await page.locator('#family-reminders').innerText(),/Vaksine/);
 await page.locator('[data-family-focus="week"]').click();
 await page.locator('.family-reminder-workday').first().waitFor({state:'visible'});
 assert.equal(await page.locator('.family-reminder-workday').count(),2);
 const items=await page.locator('.family-reminder').allInnerTexts();
 assert.match(items[0],/Planleggingsdag|SFO er stengt/);
 assert.match(items[1],/Planleggingsdag|SFO er stengt/);
 assert.match(items[2],/Vaksine/);
 assert.match(items[0]+items[1],/Påvirker arbeidsdagen/);
 assert.match(items[2],/Viktig helseinformasjon/);
 assert.doesNotMatch(items.join(' '),/Les 15 minutter/);
 assert.equal(ranks,1);
 assert.equal(planRequests,1,'Ranking existing plan must not fetch or reprocess its PDF');
 assert.deepEqual(errors,[]);
});

test('Family notices have a short source-extractive headline, verified date, full text and original PDF',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await page.evaluate(()=>localStorage.setItem('ukeplanen.family.v2',JSON.stringify({
  version:2,profiles:[{id:'child-source-digest-001',name:'Barn A',school:'sjostrand',grade:'2',group:''}]
 })));
 const source='På fredag har elevene fri på grunn av planleggingsdag. SFO holder stengt denne dagen. Husk å planlegge barnepass i god tid.';
 const extracted='På fredag har elevene fri på grunn av planleggingsdag.';
 let rankCalls=0;
 await page.route('**/api/plan?**',route=>{
  const p=basePlan('2');
  p.practicalPriorityToken='signed-document-token';
  p.createdAt='2026-10-28T09:00:00.000Z';
  p.notices=[source];
  p.provenance=[{kind:'notice',sourceQuote:extracted,sourcePage:2,day:null}];
  return reply(route,p);
 });
 await page.route('**/api/practical-priority?**',route=>{
  rankCalls++;
  return reply(route,{status:'ready',scores:{
   ['notice|'+source.toLocaleLowerCase('nb-NO')]:{
    importance:3,prepareAhead:true,shortText:extracted
   }
  }});
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#family-cards .family-child-progress').waitFor({state:'visible'});
 await page.locator('[data-family-focus="week"]').click();
 const card=page.locator('.family-reminder').filter({hasText:'planleggingsdag'});
 await card.locator('.family-reminder-date').waitFor({state:'visible'});
 assert.match(await card.locator('.family-reminder-date').innerText(),/fredag 30. oktober/i);
 assert.equal(await card.locator('.family-reminder-short').innerText(),extracted);
 assert.equal(await card.locator('.family-reminder-importance').innerText(),'Påvirker arbeidsdagen');
 await card.locator('summary').click();
 assert.match(await card.locator('.family-reminder-detail').innerText(),/Husk å planlegge barnepass/);
 assert.match(await card.locator('.family-reminder-quote').innerText(),/Kildeutdrag/);
 assert.match(await card.locator('.family-reminder-pdf').getAttribute('href'),/\.pdf#page=2$/);
 assert.equal(await card.locator('.family-reminder-pdf').getAttribute('rel'),'noopener noreferrer');
 assert.equal(rankCalls,1);
 assert.deepEqual(errors,[]);
});

test('Family practical reminder can be reported without sending private child profile information',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await page.evaluate(()=>localStorage.setItem('ukeplanen.family.v2',JSON.stringify({
  version:2,profiles:[{id:'private-child-12345',name:'HemmeligBarn',
   school:'sjostrand',grade:'2',group:''}]
 })));
 const notice='Vaksine onsdag morgen.';
 let submitted=null,submissions=0;
 await page.route('**/api/report-issue',async route=>{
  submissions++;
  submitted=route.request().postDataJSON();
  await route.fulfill({status:201,contentType:'application/json',
   body:JSON.stringify({status:'received'})});
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#family-reminders .family-reminder').first().waitFor({state:'visible'});
 const card=page.locator('.family-reminder').filter({hasText:/Vaksine/}).first();
 await card.locator('[data-family-report]').click();
 await page.locator('#issue-report-dialog').waitFor({state:'visible'});
 assert.equal(await page.locator('#issue-report-kind').inputValue(),'wrong_interpretation');
 assert.match(await page.locator('#issue-report-source').innerText(),/Vaksine/);
 await page.locator('#issue-report-details').fill('Original-PDF oppgir en annen dag.');
 await page.locator('#issue-report-submit').click();
 await page.locator('#issue-report-status').getByText(/Rapporten er registrert/).waitFor();
 assert.equal(submissions,1);
 assert.equal(submitted.school,'sjostrand');
 assert.equal(submitted.grade,'2');
 assert.equal(submitted.year,2026);
 assert.equal(submitted.week,44);
 assert.match(submitted.sourceText,/Vaksine/);
 const payload=JSON.stringify(submitted);
 assert.doesNotMatch(payload,/HemmeligBarn|private-child-12345|familyId|nickname|progress|access_token/);
 await page.locator('#issue-report-close').click();
 assert.deepEqual(errors,[]);
});

test('Missing important school notice report selects right family grade and requires details',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await page.evaluate(()=>localStorage.setItem('ukeplanen.family.v2',JSON.stringify({
  version:2,profiles:[
   {id:'family-grade-002',name:'Barn A',school:'sjostrand',grade:'2',group:''},
   {id:'family-grade-005',name:'Barn B',school:'sjostrand',grade:'5A',group:''}
  ]
 })));
 let submitted=null;
 await page.route('**/api/report-issue',async route=>{
  submitted=route.request().postDataJSON();
  await route.fulfill({status:201,contentType:'application/json',
   body:JSON.stringify({status:'received'})});
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#family-report-missing').waitFor({state:'visible'});
 await page.locator('#family-report-missing').click();
 assert.equal(await page.locator('#issue-report-kind').inputValue(),'missing_notice');
 assert.equal(await page.locator('#issue-report-context option').count(),2);
 await page.locator('#issue-report-context').selectOption('1');
 assert.equal(await page.locator('#issue-report-details').getAttribute('required'),'');
 await page.locator('#issue-report-details').fill('Skolen nevner foreldremøte fredag i PDF-en.');
 await page.locator('#issue-report-submit').click();
 await page.locator('#issue-report-status').getByText(/Rapporten er registrert/).waitFor();
 assert.equal(submitted.grade,'5A');
 assert.equal(submitted.kind,'missing_notice');
 assert.equal(submitted.sourceText,'');
 assert.doesNotMatch(JSON.stringify(submitted),/Barn A|Barn B|family-grade-/);
 assert.deepEqual(errors,[]);
});

test('Single-class school week exposes issue reporting without a family account',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 let report=null;
 await page.route('**/api/report-issue',async route=>{
  report=route.request().postDataJSON();
  await route.fulfill({status:201,contentType:'application/json',body:'{"status":"received"}'});
 });
 await chooseSchoolGrade(page,'2');
 await page.locator('#report-plan-issue').click();
 await page.locator('#issue-report-dialog').waitFor({state:'visible'});
 await page.locator('#issue-report-kind').selectOption('wrong_date');
 await page.locator('#issue-report-details').fill('Riktig dag står i skolens PDF.');
 await page.locator('#issue-report-submit').click();
 await page.locator('#issue-report-status').getByText(/Rapporten er registrert/).waitFor();
 assert.equal(report.school,'sjostrand');
 assert.equal(report.grade,'2');
 assert.equal(report.kind,'wrong_date');
 assert.match(report.pdf,/minskole\.no/);
 assert.deepEqual(errors,[]);
});

test('Unavailable school PDF still offers issue reporting from the fallback panel',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 let report=null;
 await page.route('**/api/plan?**',route=>{
  const plan=basePlan('2');
  plan.status='unpublished';plan.aiStatus='disabled';plan.pdf=null;
  return reply(route,plan);
 });
 await page.route('**/api/report-issue',async route=>{
  report=route.request().postDataJSON();
  await route.fulfill({status:201,contentType:'application/json',body:'{"status":"received"}'});
 });
 await chooseSchoolGrade(page,'2');
 await page.locator('#plan-feedback').waitFor({state:'visible'});
 assert.equal(await page.locator('#plan-body').isVisible(),false);
 await page.locator('#feedback-report-issue').click();
 await page.locator('#issue-report-dialog').waitFor({state:'visible'});
 await page.locator('#issue-report-kind').selectOption('missing_notice');
 await page.locator('#issue-report-details').fill('Skolens ukebrev ligger tilgjengelig, men vises ikke her.');
 await page.locator('#issue-report-submit').click();
 await page.locator('#issue-report-status').getByText(/Rapporten er registrert/).waitFor();
 assert.equal(report.kind,'missing_notice');
 assert.equal(report.school,'sjostrand');
 assert.equal(report.pdf,null);
 assert.deepEqual(errors,[]);
});

test('Friday after 14:00: next week shows municipality school-free date even when PDF unavailable',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844,mockNow:'2026-10-30T14:15:00Z'});
 await page.evaluate(()=>localStorage.setItem('ukeplanen.family.v2',JSON.stringify({
  version:2,profiles:[{id:'calendar-school-01',name:'Barn A',school:'fagerholt',grade:'3',group:''}]
 })));
 let calls=0;
 await page.route('**/api/school-calendar?**',async route=>{
  const params=new URL(route.request().url()).searchParams;
  calls++;
  assert.equal(params.get('school'),'fagerholt');
  assert.equal(params.get('week'),'45');
  return reply(route,{schoolId:'fagerholt',year:2026,week:45,
   sourceStatus:'live',sourceUrl:'https://www.kristiansand.kommune.no/navigasjon/barnehage-og-skole/skole-og-sfo/skoleruta/',
   schoolUrl:'https://www.minskole.no/fagerholt',checkedAt:'2026-10-30',
   events:[{date:'2026-11-06',schoolFree:true,sfoClosed:false,sfoStatus:'unknown',
    label:'Fridag (Sørlandsk lærerstevne)'}]});
 });
 await page.route('**/api/plan?**',route=>reply(route,{status:'unpublished',
  schoolId:'fagerholt',grade:'3',week:45,year:2026,aiStatus:'disabled',pdf:null}));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('.family-reminder-municipal').waitFor({state:'visible'});
 const card=page.locator('.family-reminder-municipal');
 assert.match(await card.innerText(),/fredag 6. november/i);
 assert.match(await card.innerText(),/Fridag \(Sørlandsk lærerstevne\)/);
 assert.match(await card.innerText(),/SFO.*ikke oppgitt/i);
 assert.match(await card.innerText(),/lokale avvik/i);
 assert.equal(await card.locator('a').first().getAttribute('href'),
  'https://www.kristiansand.kommune.no/navigasjon/barnehage-og-skole/skole-og-sfo/skoleruta/');
 assert.equal(await page.locator('.family-reminder-municipal').count(),1);
 assert.equal(calls,1,'One municipal fetch per school/week, not per child');
 assert.deepEqual(errors,[]);
});

test('School-calendar reminder comes before vaccine from school PDF; multiple children share one municipal alert',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844,mockNow:'2026-11-02T07:20:00Z'});
 await page.evaluate(()=>localStorage.setItem('ukeplanen.family.v2',JSON.stringify({
  version:2,profiles:[
   {id:'calendar-child-001',name:'Barn A',school:'fagerholt',grade:'3',group:''},
   {id:'calendar-child-002',name:'Barn B',school:'fagerholt',grade:'7',group:''}
  ]
 })));
 await page.route('**/api/school-calendar?**',route=>reply(route,{
  schoolId:'fagerholt',year:2026,week:45,sourceStatus:'live',
  sourceUrl:'https://www.kristiansand.kommune.no/navigasjon/barnehage-og-skole/skole-og-sfo/skoleruta/',
  schoolUrl:'https://www.minskole.no/fagerholt',checkedAt:'2026-11-02',
  events:[{date:'2026-11-06',schoolFree:true,sfoStatus:'unknown',
   label:'Fridag (Sørlandsk lærerstevne)'}]
 }));
 await page.route('**/api/plan?**',route=>{
  const p=basePlan('2');p.week=45;p.year=2026;p.grade='3';p.dayNotes={
   Onsdag:[{text:'Vaksine onsdag morgen.'}]};return reply(route,p);
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('.family-reminder-municipal').waitFor({state:'visible'});
 const list=page.locator('#family-reminders .family-reminder');
 assert.ok(await list.count()>=2);
 assert.match(await list.first().innerText(),/Fridag.*Sørlandsk/);
 assert.equal(await page.locator('.family-reminder-municipal').count(),1);
 await page.locator('.family-reminder-municipal [data-family-report]').click();
 await page.locator('#issue-report-dialog').waitFor({state:'visible'});
 assert.equal(await page.locator('#issue-report-source').isVisible(),true);
 assert.deepEqual(errors,[]);
});

test('Explicit municipal SFO closure says closed; other holiday dates do not imply SFO closure',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844,mockNow:'2026-12-18T15:15:00Z'});
 await page.evaluate(()=>localStorage.setItem('ukeplanen.family.v2',JSON.stringify({
  version:2,profiles:[{id:'calendar-child-sfo',name:'Barn A',
   school:'fagerholt',grade:'3',group:''}]
 })));
 await page.route('**/api/plan?**',route=>reply(route,{
  status:'unpublished',schoolId:'fagerholt',grade:'3',year:2026,week:52,pdf:null
 }));
 await page.route('**/api/school-calendar?**',route=>reply(route,{
  schoolId:'fagerholt',year:2026,week:52,sourceStatus:'snapshot',checkedAt:'2026-10-30',
  events:[
   {date:'2026-12-21',label:'Juleferie',schoolFree:true,sfoStatus:'unknown'},
   {date:'2026-12-24',label:'Juleferie',schoolFree:true,sfoClosed:true,sfoStatus:'closed'}
  ]
 }));
 await page.reload({waitUntil:'domcontentloaded'});
 const first=page.locator('.family-reminder-municipal').filter({hasText:'21. desember'});
 const closure=page.locator('.family-reminder-municipal').filter({hasText:'24. desember'});
 await closure.waitFor({state:'visible'});
 assert.match(await closure.innerText(),/SFO: kommunen bekrefter stengt/);
 assert.match(await first.innerText(),/ikke oppgitt/);
 assert.match(await page.locator('#family-calendar-status').innerText(),/sist kontrollerte kilde/i);
 assert.deepEqual(errors,[]);
});

test('Opening a ready AI family plan is instant and browser Back and Forward restore views',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await page.evaluate(()=>localStorage.setItem('ukeplanen.family.v2',JSON.stringify({
  version:2,profiles:[{id:'child-instant-001',name:'Barn A',school:'sjostrand',grade:'2',group:''}]
 })));
 let requests=0;
 await page.route('**/api/plan?**',route=>{
  requests++;
  const p=basePlan('2');
  p.homework=[{subject:'Norsk',text:'Les i ukeplanen',dueDay:'Torsdag'}];
  return reply(route,p);
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#family-cards .family-child-progress').waitFor({state:'visible'});
 const initialRequests=requests;
 await page.locator('#family-cards [data-family-open]').first().click();
 assert.equal(await page.locator('#app-view').isVisible(),true);
 assert.equal(await page.locator('#plan-body').isVisible(),true);
 assert.equal(await page.locator('#plan-feedback').isVisible(),false);
 assert.match(await page.locator('#homework-list').innerText(),/Les i ukeplanen/);
 assert.equal(requests,initialRequests,'Ready AI plan must be handed directly from family view');
 await page.goBack();
 await page.locator('#family-view').waitFor({state:'visible'});
 assert.equal(requests,initialRequests,'History Back returns to the family without reloading the opened PDF');
 await page.goForward();
 await page.locator('#app-view').waitFor({state:'visible'});
 assert.equal(await page.locator('#plan-body').isVisible(),true);
 assert.equal(requests,initialRequests,'History Forward should also reuse verified AI data');
 assert.deepEqual(errors,[]);
});

test('Browser Back visits grade selection, school selection and home in order',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await page.locator('#landing-open-plan').click();
 await page.locator('#school-gate').waitFor({state:'visible'});
 await page.locator('[data-school="sjostrand"]').click();
 await page.locator('#grade-choices [data-grade="2"]').waitFor({state:'visible'});
 await page.locator('[data-grade="2"]').click();
 await page.locator('#app-view').waitFor({state:'visible'});
 await page.goBack();
 await page.locator('#grade-gate').waitFor({state:'visible'});
 await page.goBack();
 await page.locator('#school-gate').waitFor({state:'visible'});
 await page.goBack();
 await page.locator('#welcome-view').waitFor({state:'visible'});
 await page.goForward();
 await page.locator('#school-gate').waitFor({state:'visible'});
 assert.deepEqual(errors,[]);
});

test('Family grade selection, edited profiles and single-class navigation survive mobile screens',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await page.locator('#family-toggle').click();
 await addFamilyChild(page,'Min profil','5A');
 await page.locator('[data-family-edit]').click();
 await page.locator('#family-name').fill('Oppdatert profil');
 await page.locator('#family-save').click();
 assert.match(await page.locator('#family-cards').innerText(),/Oppdatert profil/);
 await page.locator('#family-return').click();
 assert.equal(await page.locator('#family-view').isVisible(),false);
 assert.equal(await page.locator('#school-gate').isVisible(),true);
 assert.deepEqual(errors,[]);
});

test('2.1 parent email OTP, create family and cloud-mode dashboard work with mocked Supabase',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 const endpoint='https://testprojectabc.supabase.co';
 await page.route('**/api/account-config*',route=>reply(route,{
  enabled:true,url:endpoint+'/',publishableKey:'sb_publishable_test_not_a_real_key'
 }));
 // Intercept fetch inside Chromium: CORS preflight/DNS never leaves this
 // test and we exercise the real account UI + client state transitions.
 await page.addInitScript(()=>{
  const original=window.fetch.bind(window);
  let families=[],children=[];
  window.__otpRequests=0;
  window.fetch=(input,init={})=>{
   const url=typeof input==='string'?input:input.url;
   if(!url.startsWith('https://testprojectabc.supabase.co/'))return original(input,init);
   let data={};
   if(url.includes('/auth/v1/otp')){window.__otpRequests++;data={};}
   else if(url.includes('/auth/v1/verify'))data={access_token:'access-token',
    refresh_token:'refresh-token',expires_in:3600,user:{id:'guardian-one',email:'parent@example.no'}};
   else if(url.includes('/rest/v1/rpc/create_family')){
    families=[{id:'family-1',name:'Min familie',created_by:'guardian-one'}];data='family-1';
   }else if(url.includes('/rest/v1/families'))data=families;
   else if(url.includes('/rest/v1/children')&&init.method==='POST'){
    const child=JSON.parse(init.body);children.push({...child,id:'child-'+(children.length+1)});
    data=[children.at(-1)];
   }
   else if(url.includes('/rest/v1/children'))data=children;
   else if(url.includes('/rest/v1/homework_progress'))data=[];
   else if(url.includes('/auth/v1/user'))data={id:'guardian-one',email:'parent@example.no'};
   else return Promise.resolve(new Response(JSON.stringify({message:'Unexpected '+url}),{status:404,headers:{'Content-Type':'application/json'}}));
   return Promise.resolve(new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}}));
  };
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#account-button').click();
 await page.locator('#account-email').fill('parent@example.no');
 await page.locator('#account-send-code').click();
 await page.waitForTimeout(400);
 assert.match(await page.locator('#account-message').textContent(),/sendt/i,
   'OTP response missing. Account mode: '+await page.locator('#account-panel').innerText());
 assert.equal(await page.locator('#account-resend-code').isVisible(),true);
 await page.locator('#account-resend-code').click();
 assert.match(await page.locator('#account-message').textContent(),/Vent .*sekunder/i);
 assert.equal(await page.evaluate(()=>window.__otpRequests),1);
 await page.evaluate(()=>{
  window.__originalDateNow=Date.now;
  Date.now=()=>window.__originalDateNow()+61000;
 });
 await page.locator('#account-resend-code').click();
 await page.getByText(/En ny engangskode er forespurt/i).waitFor();
 assert.equal(await page.evaluate(()=>window.__otpRequests),2);
 await page.evaluate(()=>{Date.now=window.__originalDateNow;});
 await page.locator('#account-code').fill('123456');
 await page.locator('#account-verify').click();
 await page.locator('#account-family-name').fill('Min familie');
 await page.locator('#account-create').click();
 await page.locator('[data-account-screen="children"]').waitFor({state:'visible'});
 assert.equal(await page.locator('#onboard-children-list .onboard-child-item').count(),0);
 await page.locator('#onboard-child-name').fill('Testbarn');
 await page.locator('#onboard-child-school').selectOption('sjostrand');
 await page.locator('#onboard-child-grade option[value="2"]').waitFor({state:'attached'});
 await page.locator('#onboard-child-grade').selectOption('2');
 await page.locator('#onboard-child-save').click();
 await page.locator('#onboard-children-list .onboard-child-item').first().waitFor();
 assert.equal(await page.locator('#onboard-children-list .onboard-child-item').count(),1);
 await page.locator('#onboard-children-next').click();
 assert.equal(await page.locator('[data-account-screen="completed"]').isVisible(),true);
 await page.locator('#onboard-dashboard').click();
 await page.locator('#family-view').waitFor({state:'visible'});
 assert.equal(await page.locator('#family-cards .family-child').count(),1);
 assert.equal(await page.locator('#account-current-family').textContent(),'Min familie');
 assert.match(await page.locator('#family-storage-label').textContent(),/Synkronisert familie/);
 assert.deepEqual(errors,[]);
});
