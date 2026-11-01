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
 if(await page.locator('#welcome-view').isVisible()){
  const alternatives=page.locator('#landing-other-options');
  if(await alternatives.isVisible()&&await alternatives.getAttribute('aria-expanded')==='false')
   await alternatives.click();
  await page.locator('#landing-open-plan').click();
 }
 await page.locator('#school-search').fill('Sjøstrand');
 await page.locator('[data-school="sjostrand"]').click();
 await page.locator('[data-grade="'+grade+'"]').click();
 await page.locator('#school-name').waitFor({state:'visible'});
}
test('New landing presents a family-first choice and keeps guest access visible',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await page.locator('#welcome-view').waitFor({state:'visible'});
 assert.match(await page.locator('#welcome-title').innerText(),/Skole, lekser og fritid/);
 assert.equal(await page.locator('.welcome-choice').count(),3);
 assert.equal(await page.locator('a[href="/barn/"]').isVisible(),false,
  'Mobile first-run keeps secondary choices collapsed');
 assert.equal(await page.locator('#landing-open-plan').isVisible(),false);
 assert.equal(await page.locator('#landing-create-family').isVisible(),true);
 assert.equal(await page.locator('#landing-other-options').isVisible(),true);
 const layout=await page.locator('#welcome-view').evaluate(view=>({
  width:view.scrollWidth,viewport:window.innerWidth,
  primary:view.querySelector('#landing-create-family').getBoundingClientRect().bottom
 }));
 assert.ok(layout.width<=layout.viewport+1,'Welcome must fit a small phone');
 assert.ok(layout.primary<750,'Main signup action should appear in the first mobile viewport');
 await page.locator('#landing-other-options').click();
 assert.equal(await page.locator('a[href="/barn/"]').isVisible(),true);
 assert.equal(await page.locator('#landing-open-plan').isVisible(),true);
 assert.equal(await page.locator('#landing-local-family').isVisible(),true);
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
 await page.locator('#landing-other-options').click();
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
 assert.equal(await page.locator('#homework-list .content-type-label.content-kind-homework').count(),0,
  'Homework section heading already identifies each task');
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

async function setFamilyCalendarWholeWeek(page){
 await page.locator('#family-mobile-calendar-options > summary').click();
 await page.locator('[data-family-mobile-range]').click();
}
async function toggleFamilyCalendarWeekend(page){
 await page.locator('#family-mobile-calendar-options > summary').click();
 await page.locator('[data-family-mobile-weekend]').click();
}
async function expandFirstFamilyActivity(page){
 const activity=page.locator('#family-agenda-days .family-agenda-item.kind-family').first();
 await activity.locator('[data-family-agenda-details]').click();
}
async function addFamilyChild(page,name,grade='2'){
 const mobile=await page.evaluate(()=>window.matchMedia('(max-width:700px)').matches);
 await page.locator(mobile?'#family-mobile-add':'#family-add').click();
 await page.locator('#family-name').fill(name);
 await page.locator('#family-school').selectOption('sjostrand');
 await page.locator('#family-grade option[value="'+grade+'"]').waitFor({state:'attached'});
 await page.locator('#family-grade').selectOption(grade);
 await page.locator('#family-save').click();
 await page.locator('#family-cards .family-child').filter({hasText:name}).waitFor();
}
test('Header Ukeplan opens an existing child and reloading its plan stays on that child',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await page.locator('#family-toggle').click();
 await addFamilyChild(page,'Første barn');
 await addFamilyChild(page,'Andre barn');
 await page.locator('#nav-plan').click();
 await page.locator('#app-view').waitFor({state:'visible'});
 assert.match(await page.locator('#plan-context-class').innerText(),/Første barn/);
 assert.equal(await page.locator('#school-gate').isVisible(),false);
 assert.equal(await page.locator('#grade-gate').isVisible(),false);
 await page.locator('#plan-back-family').click();
 await page.locator('#family-cards .family-child').nth(1).locator('[data-family-compact-open]:visible, [data-family-open]:visible').click();
 await page.locator('#app-view').waitFor({state:'visible'});
 assert.match(await page.locator('#plan-context-class').innerText(),/Andre barn/);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#app-view').waitFor({state:'visible'});
 assert.match(await page.locator('#plan-context-class').innerText(),/Andre barn/);
 assert.equal(await page.locator('#family-view').isVisible(),false);
 assert.equal(await page.locator('#school-gate').isVisible(),false);
 assert.equal(await page.locator('#grade-gate').isVisible(),false);
 assert.equal(await page.locator('#nav-plan').getAttribute('aria-current'),'page');
 assert.deepEqual(errors,[]);
});

test('An explicitly selected welcome page survives reload even when family profiles exist',async t=>{
 const {page,errors}=await openPage(t);
 await page.locator('#family-toggle').click();
 await addFamilyChild(page,'Barn med egen profil');
 await page.locator('#nav-home').click();
 await page.locator('#welcome-view').waitFor({state:'visible'});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#welcome-view').waitFor({state:'visible'});
 assert.equal(await page.locator('#family-view').isVisible(),false);
 assert.deepEqual(errors,[]);
});

test('Tomorrow overview shows Thursday homework and packing, then opens that exact calendar day',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await page.route('**/api/plan?**',route=>{
  const plan=basePlan('2');
  plan.homework=[{subject:'Norsk',text:'Les 10 minutter på torsdag',dueDay:'Torsdag'}];
  plan.days.Torsdag.bring=[{label:'Drikkeflaske'}];
  return reply(route,plan);
 });
 await page.locator('#family-toggle').click();
 await addFamilyChild(page,'Ailin');
 await page.locator('#family-tomorrow-brief').waitFor({state:'visible'});
 await page.locator('#family-tomorrow-brief-items').getByText(/Les 10 minutter/).waitFor();
 await page.locator('#family-tomorrow-brief-items').getByText(/Drikkeflaske/).waitFor();
 assert.match(await page.locator('#family-tomorrow-brief-date').innerText(),/torsdag 29. oktober/i);
 assert.equal(await page.locator('#family-tomorrow-brief-count').innerText().then(x=>x.includes('punkt')),true);
 // A parent can tap anywhere on a packing task without searching the child cards.
 const packing=page.locator('#family-tomorrow-brief-items button[data-family-tomorrow-child]')
  .filter({hasText:'Drikkeflaske'});
 assert.match(await packing.getAttribute('aria-label'),/Åpne ukeplanen til Ailin/);
 await packing.click();
 await page.locator('#app-view').waitFor({state:'visible'});
 assert.match(await page.locator('#plan-context-class').innerText(),/Ailin/);
 await page.locator('#plan-back-family').click();
 await page.locator('#family-tomorrow-brief').waitFor({state:'visible'});
 await page.locator('#family-tomorrow-brief-calendar').click();
 assert.equal(await page.locator('[data-family-mobile-tab="calendar"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#family-tomorrow-brief').isVisible(),false);
 assert.equal(await page.locator('#family-agenda-days .family-agenda-day:visible').count(),1);
 assert.equal(await page.locator('#family-agenda-days .family-agenda-day:visible').getAttribute('data-date'),'2026-10-29');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#family-agenda-days .family-agenda-day[data-date="2026-10-29"]').waitFor({state:'visible'});
 assert.equal(await page.locator('#family-agenda-days .family-agenda-day:visible').count(),1);
 assert.deepEqual(errors,[]);
});
test('Friday afternoon: tomorrow means Saturday family activities, never next Monday lessons',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844,mockNow:'2026-10-30T14:00:00Z'});
 await page.locator('#family-toggle').click();
 await addFamilyChild(page,'Ailin');
 await page.locator('[data-family-mobile-tab="activities"]').click();
 await page.locator('#family-activity-add').click();
 await page.locator('#family-activity-name').fill('Lørdagsfotball');
 await page.locator('#family-activity-date').fill('2026-10-31');
 await page.locator('#family-activity-start').fill('12:00');
 await page.locator('#family-activity-save').click();
 await page.locator('[data-family-mobile-tab="overview"]').click();
 await page.locator('#family-tomorrow-brief-items').getByText('Lørdagsfotball').waitFor();
 assert.match(await page.locator('#family-tomorrow-brief-date').innerText(),/lørdag 31. oktober/i);
 assert.doesNotMatch(await page.locator('#family-tomorrow-brief-items').innerText(),/Mandagslekse|Neste mandag/);
 assert.equal(await page.locator('#family-tomorrow-brief-calendar').isVisible(),false);
 assert.match(await page.locator('#family-tomorrow-brief-notice').innerText(),/annen uke/);
 assert.equal(await page.locator('#family-tomorrow-brief-items button[data-family-tomorrow-child]').count(),0,
  'Family activities should not pretend to be school-plan shortcuts');
 assert.deepEqual(errors,[]);
});
test('Mobile local family keeps guest navigation and shares persistent header across tabs',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 // Public pages and the individual child plan still use the generic navigation.
 assert.equal(await page.locator('.primary-nav').isVisible(),true);
 await page.locator('#family-toggle').click();
 await addFamilyChild(page,'Barn med familie');
 assert.equal(await page.locator('.primary-nav').isVisible(),true,
  'The public bottom navigation must remain usable for a guest/local family');
 assert.equal(await page.locator('body').evaluate(x=>x.classList.contains('family-cloud-active')),false);
 assert.equal(await page.locator('body').evaluate(x=>x.classList.contains('family-dashboard-active')),true);
 assert.equal(await page.locator('.topbar').evaluate(x=>getComputedStyle(x).position),'sticky');
 assert.equal(await page.locator('#header-family-week').innerText(),'Uke 44');
 assert.equal(await page.locator('#home-link').getAttribute('aria-label'),'Gå til toppen av Min familie');
 for(const tab of ['overview','calendar','activities']){
  await page.locator('[data-family-mobile-tab="'+tab+'"]').click();
  assert.equal(await page.locator('.family-mobile-overview-heading').isVisible(),true);
  assert.equal(await page.locator('.family-overview-top').isVisible(),false,
   'All family tabs must share the same compact header');
  assert.equal(await page.locator('#family-mobile-nav').isVisible(),true);
 }
 // Scroll a long family view: both brand and tabs should remain in view.
 await page.evaluate(()=>{
  document.getElementById('family-view').style.minHeight='1700px';
  window.scrollTo({top:600,behavior:'instant'});
 });
 await page.waitForTimeout(100);
 const geometry=await page.evaluate(()=>{
  const header=document.querySelector('.topbar').getBoundingClientRect();
  const tabs=document.getElementById('family-mobile-nav').getBoundingClientRect();
  return {headerTop:header.top,headerBottom:header.bottom,tabsTop:tabs.top,scroll:scrollY};
 });
 assert.ok(geometry.scroll>300,'Test must scroll far enough to check sticky behavior');
 assert.ok(Math.abs(geometry.headerTop)<3,'Skoleuka logo and account header must stay visible');
 assert.ok(geometry.tabsTop>=geometry.headerBottom-3 &&
  geometry.tabsTop<=geometry.headerBottom+15,'Family tabs must not overlap the branded header');
 await page.locator('#home-link').click();
 assert.equal(await page.locator('#family-view').isVisible(),true,
  'Clicking the brand inside a family must not open the public onboarding page');
 await page.locator('[data-family-mobile-tab="overview"]').click();
 await page.locator('#family-cards .family-child-compact').first().click();
 await page.locator('#app-view').waitFor({state:'visible'});
 assert.equal(await page.locator('.primary-nav').isVisible(),true,
  'The regular bottom navigation remains available on child week plans');
 assert.deepEqual(errors,[]);
});
test('Desktop family navigation and overview header remain unchanged',async t=>{
 const {page,errors}=await openPage(t,{width:1280,height:850});
 await page.locator('#family-toggle').click();
 assert.equal(await page.locator('.primary-nav').isVisible(),true);
 assert.equal(await page.locator('.family-overview-top').isVisible(),true);
 assert.equal(await page.locator('#header-family-week').isVisible(),false);
 assert.notEqual(await page.locator('.topbar').evaluate(x=>getComputedStyle(x).position),'sticky');
 assert.deepEqual(errors,[]);
});
test('Mobile family overview shows two compact tappable children, hides administration and keeps desktop intact',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await page.locator('#family-toggle').click();
 await addFamilyChild(page,'Barn A');
 await addFamilyChild(page,'Barn B');
 assert.equal(await page.locator('.family-overview-top').isVisible(),false);
 assert.equal(await page.locator('.family-mobile-overview-heading').isVisible(),true);
 assert.equal(await page.locator('#family-cards .family-child-compact:visible').count(),2);
 assert.equal(await page.locator('#family-cards .family-child-heading:visible').count(),0);
 assert.equal(await page.locator('#family-cards .family-child-extra:visible').count(),0);
 assert.equal(await page.locator('#family-cards .family-ai-label:visible').count(),0);
 assert.equal(await page.locator('#family-mobile-add').isVisible(),true);
 assert.equal(await page.locator('#family-refresh').isVisible(),false);
 assert.equal(await page.locator('#family-cards [data-family-pair]:visible').count(),0);
 assert.equal(await page.locator('#family-cards [data-family-open]:visible').count(),0);
 const compact=page.locator('#family-cards .family-child-compact').first();
 assert.match(await compact.innerText(),/Barn A/);
 const bounds=await page.locator('#family-cards').evaluate(node=>{
  const cards=[...node.querySelectorAll('.family-child-compact')].map(el=>el.getBoundingClientRect());
  return {heights:cards.map(rect=>rect.height),scroll:node.scrollWidth>node.clientWidth+1};
 });
 assert.equal(bounds.scroll,false);
 assert.ok(bounds.heights.every(h=>h<=115),'Mobile child cards should be compact');
 await page.locator('#family-mobile-admin-toggle').click();
 assert.equal(await page.locator('#family-refresh').isVisible(),true);
 assert.equal(await page.locator('[data-family-more]:visible').count(),2);
 await page.locator('#family-mobile-admin-toggle').click();
 assert.equal(await page.locator('[data-family-more]:visible').count(),0);
 await page.locator('#family-cards .family-child-compact').nth(1).click();
 await page.locator('#app-view').waitFor({state:'visible'});
 assert.match(await page.locator('#plan-context-class').innerText(),/Barn B/);
 assert.deepEqual(errors,[]);
});
test('Mobile family dashboard uses compact tabs, focused calendar day and fewer child actions',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 await page.locator('#family-toggle').click();
 await addFamilyChild(page,'Barn A');
 await addFamilyChild(page,'Barn B');
 assert.equal(await page.locator('#family-mobile-nav').isVisible(),true);
 assert.equal(await page.locator('#family-children').isVisible(),true);
 assert.equal(await page.locator('.family-tomorrow').isVisible(),true);
 assert.equal(await page.locator('.family-agenda').isVisible(),false);
 assert.equal(await page.locator('#family-activity-section').isVisible(),false);
 const card=page.locator('#family-cards .family-child').first();
 assert.equal(await card.locator('[data-family-compact-open]:visible, [data-family-open]:visible').isVisible(),true);
 assert.equal(await card.locator('[data-family-edit]').isVisible(),false);
 await page.locator('#family-mobile-admin-toggle').click();
 await card.locator('[data-family-more]').click();
 assert.equal(await card.locator('[data-family-edit]').isVisible(),true);
 await page.locator('[data-family-mobile-tab="calendar"]').click();
 assert.equal(await page.locator('.family-agenda').isVisible(),true);
 assert.equal(await page.locator('#family-mobile-days [data-family-mobile-day]').count(),5);
 assert.equal(await page.locator('#family-agenda-days .family-agenda-item>.family-agenda-type:visible').count(),0);
 assert.equal(await page.locator('.family-agenda-key').isVisible(),false);
 assert.equal(await page.locator('#family-children').isVisible(),false);
 await page.locator('.family-agenda-day:visible').first().waitFor({state:'visible'});
 assert.equal(await page.locator('.family-agenda-day:visible').count(),1);
 await setFamilyCalendarWholeWeek(page);
 assert.equal(await page.locator('.family-agenda-day:visible').count(),5);
 await page.locator('[data-family-mobile-day="2"]').click();
 assert.equal(await page.locator('.family-agenda-day:visible').count(),1);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('.family-agenda-day:visible').first().waitFor();
 assert.equal(await page.locator('[data-family-mobile-tab="calendar"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('.family-agenda-day:visible').count(),1);
 assert.equal(await page.locator('[data-family-mobile-day="2"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-family-mobile-tab="activities"]').click();
 assert.equal(await page.locator('#family-activity-section').isVisible(),true);
 assert.equal(await page.locator('.family-agenda').isVisible(),false);
 assert.deepEqual(errors,[]);
});
test('320px calendar shows five dates without scrolling and retains source details on demand',async t=>{
 const {page,errors}=await openPage(t,{width:320,height:700});
 await page.locator('#family-toggle').click();
 await addFamilyChild(page,'Barn på mobil');
 await page.locator('[data-family-mobile-tab="calendar"]').click();
 await page.locator('#family-agenda-days .family-agenda-item:visible').first().waitFor();
 const bounds=await page.locator('#family-mobile-days').evaluate(el=>{
  const parent=el.getBoundingClientRect(),tiles=[...el.querySelectorAll('button')].map(x=>x.getBoundingClientRect());
  return {count:tiles.length,allFit:tiles.every(t=>t.left>=parent.left-1&&t.right<=parent.right+1),
   scroll:el.scrollWidth>el.clientWidth+1,dates:[...el.querySelectorAll('.family-mobile-day-date')]
    .map(x=>x.textContent)};
 });
 assert.equal(bounds.count,5);
 assert.equal(bounds.allFit,true,'All five date tiles must fit on a 320px screen');
 assert.equal(bounds.scroll,false,'Date picker must not require sideways scrolling');
 const menu=await page.locator('#family-mobile-calendar-options > summary').evaluate(el=>{
  const rect=el.getBoundingClientRect(),calendar=el.closest('.family-mobile-calendar-controls').getBoundingClientRect();
  const label=el.textContent.trim();
  const styles=getComputedStyle(el);
  return {width:rect.width,within:rect.left>=calendar.left-1&&rect.right<=calendar.right+1,
   contentFits:el.scrollWidth<=el.clientWidth+1,label,aria:el.getAttribute('aria-label'),
   after:getComputedStyle(el,'::after').content,overflow:styles.overflowX};
 });
 assert.equal(menu.label,'⋯','Calendar overflow button should not show long visible text');
 assert.equal(menu.aria,'Flere kalendervalg');
 assert.ok(menu.width<=39&&menu.within&&menu.contentFits,
  'Overflow button must fit in its own fixed-width column without overlapping Friday');
 assert.ok(bounds.dates.every(d=>/^[0-9]{1,2}$/.test(d)),'Dates must be visible');
 const card=page.locator('#family-agenda-days .family-agenda-item:visible').first();
 assert.equal(await card.locator('.family-agenda-item-more').isVisible(),false);
 assert.equal(await card.locator('.family-agenda-compact-icon').isVisible(),true);
 assert.equal(await card.locator('.family-agenda-expand').isVisible(),true);
 await card.locator('.family-agenda-expand').click();
 assert.equal(await card.locator('.family-agenda-item-more').isVisible(),true);
 assert.equal(await card.locator('.family-agenda-expand').getAttribute('aria-expanded'),'true');
 assert.deepEqual(errors,[]);
});
test('Desktop family layout remains complete after the mobile navigation redesign',async t=>{
 const {page,errors}=await openPage(t,{width:1280,height:850});
 await page.locator('#family-toggle').click();
 await addFamilyChild(page,'Barn desktop');
 assert.equal(await page.locator('#family-mobile-nav').isVisible(),false);
 assert.equal(await page.locator('#family-children').isVisible(),true);
 assert.equal(await page.locator('.family-tomorrow').isVisible(),true);
 assert.equal(await page.locator('.family-agenda').isVisible(),true);
 assert.equal(await page.locator('#family-activity-section').isVisible(),true);
 // Even if three or more notices unhide the mobile-only toggle, desktop must not show it.
 await page.locator('#family-mobile-important-more').evaluate(el=>{el.hidden=false;});
 assert.equal(await page.locator('#family-mobile-important-more').isVisible(),false);
 assert.equal(await page.locator('#family-cards [data-family-edit]').first().isVisible(),true);
 assert.deepEqual(errors,[]);
});

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
 assert.equal(await page.locator('#family-practical-details').evaluate(el=>el.open),false);
 await ensurePracticalOpen(page);
 assert.equal(await page.locator('#family-reminders').isVisible(),true);
 await ensurePracticalOpen(page);
 await page.locator('[data-family-focus="week"]').click();
 assert.equal(await page.locator('[data-family-focus="week"]').getAttribute('aria-pressed'),'true');
 await ensurePracticalOpen(page);
 await page.locator('#family-reminders').getByText(/Gymtøy/).first().waitFor({state:'visible'});
 assert.match(await page.locator('#family-reminders').innerText(),/Gymtøy/);
 assert.doesNotMatch(await page.locator('#family-reminders').innerText(),/Les en bok fra skolen/);
 await ensurePracticalOpen(page);
 await page.locator('[data-family-focus="today"]').click();
 assert.equal(await page.locator('[data-family-focus="today"]').getAttribute('aria-pressed'),'true');
 await page.locator('#family-cards [data-family-compact-open]:visible, #family-cards [data-family-open]:visible').first().click();
 await page.locator('#homework-list input[type=checkbox]').first().waitFor();
 await page.locator('#homework-list input[type=checkbox]').first().check();
 await page.locator('#family-toggle').click();
 await page.locator('#family-cards .family-child').first().locator('.family-mobile-progress-track').waitFor({state:'visible'});
 assert.match(await page.locator('#family-cards .family-child').first().locator('.family-mobile-progress').innerText(),/1 av 2/);
 assert.match(await page.locator('#family-cards .family-child').nth(1).locator('.family-mobile-progress').innerText(),/0 av 2/);
 await page.locator('#family-mobile-admin-toggle').click();
 await page.locator('#family-cards .family-child').nth(1).locator('[data-family-more]').click();
 await page.locator('#family-cards .family-child').nth(1).locator('.family-child-extra > summary').click();
 await page.locator('#family-cards .family-child').nth(1).locator('input[data-family-check]').first().check();
 assert.match(await page.locator('#family-cards .family-child').nth(1).locator('.family-mobile-progress').innerText(),/1 av 2/);
 await page.locator('#family-cards .family-child').first().locator('[data-family-more]').click();
 await page.locator('#family-cards .family-child').first().locator('.family-child-extra > summary').click();
 await page.locator('#family-cards .family-child').first().locator('input[data-family-index="0"]').uncheck();
 assert.match(await page.locator('#family-cards .family-child').first().locator('.family-mobile-progress').innerText(),/0 av 2/);
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
 await page.locator('#family-cards .family-mobile-progress-track:visible, #family-cards .family-child-progress:visible').first().waitFor({state:'visible',timeout:20000});
 assert.equal(await page.locator('#family-cards .family-mobile-progress-track:visible, #family-cards .family-child-progress:visible').count(),2);
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
 await page.locator('#family-cards .family-mobile-progress-track:visible, #family-cards .family-child-progress:visible').first().waitFor({state:'visible',timeout:25000});
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
 await page.locator('#family-cards .family-mobile-progress-label:visible, #family-cards .family-not-ready:visible').first().waitFor({state:'visible'});
 assert.match(await page.locator('#family-week').innerText(),new RegExp('Uke '+shown.week));
 assert.equal(await page.locator('.family-child-week').count(),2);
 assert.match(await page.locator('.family-child-week').first().innerText(),new RegExp('UKE '+shown.week));
 assert.match(await page.locator('#family-cards').innerText(),/Ukeplan ikke publisert/);
 assert.equal(await page.locator('#family-cards .family-mobile-progress-track:visible').count(),0);
 assert.equal(await page.locator('.family-focus-tabs').isVisible(),false);
 assert.match(await page.locator('#family-week-progress').innerText(),/Avventer ukeplan/);
 assert.doesNotMatch(await page.locator('#family-view').innerText(),/GAMMEL UKE/);
 assert.ok(urls.length>=1&&urls.every(x=>x.includes('nextWeek=1')),
  'Only the next-week PDF must be requested by family overview');
 await page.locator('#family-cards [data-family-compact-open]:visible, #family-cards [data-family-open]:visible').first().click();
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
 await page.locator('#family-cards .family-mobile-progress-track:visible, #family-cards .family-child-progress:visible').waitFor({state:'visible'});
 assert.match(await page.locator('#family-cards').innerText(),/Lekser/);
 await page.locator('#family-mobile-admin-toggle').click();
 await page.locator('#family-cards [data-family-more]').first().click();
 await page.locator('#family-cards .family-child-extra > summary').click();
 assert.match(await page.locator('#family-cards').innerText(),/Les til mandag NESTE UKE/);
 await ensurePracticalOpen(page);
 await page.locator('#family-reminders').getByText(/Gymtøy for neste uke/).first().waitFor({state:'visible'});
 assert.match(await page.locator('#family-reminders').innerText(),/Gymtøy for neste uke/);
 assert.match(await page.locator('#family-mobile-week').innerText(),new RegExp('Uke '+shown.week));
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
 await page.locator('#family-cards .family-mobile-progress-track:visible, #family-cards .family-child-progress:visible').waitFor({state:'visible'});
 await ensurePracticalOpen(page);
 assert.equal(await page.locator('.family-focus-tabs').isVisible(),true);
 assert.equal(requested.every(x=>x===null),true);
 assert.match(await page.locator('#family-mobile-week').innerText(),new RegExp('Uke '+now.week));
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
 await ensurePracticalOpen(page);
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
 await page.locator('#family-cards .family-mobile-progress-track:visible, #family-cards .family-child-progress:visible').waitFor({state:'visible'});
 await ensurePracticalOpen(page);
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
 await page.locator('#family-cards [data-family-compact-open]:visible, #family-cards [data-family-open]:visible').first().click();
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
 await page.locator('#family-cards .family-mobile-progress-track:visible, #family-cards .family-child-progress:visible').waitFor({state:'visible'});
 // The default "Neste skoledag" tab must not hide an upcoming Friday SFO closure.
 await ensurePracticalOpen(page);
 await page.locator('.family-reminder-workday').first().waitFor({state:'visible'});
 assert.match(await page.locator('#family-reminders').innerText(),/SFO er stengt/);
 assert.match(await page.locator('#family-reminders').innerText(),/Vaksine/);
 await ensurePracticalOpen(page);
 await page.locator('[data-family-focus="week"]').click();
 await ensurePracticalOpen(page);
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
 await page.locator('#family-cards .family-mobile-progress-track:visible, #family-cards .family-child-progress:visible').waitFor({state:'visible'});
 await ensurePracticalOpen(page);
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
 await ensurePracticalOpen(page);
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
 await ensurePracticalOpen(page);
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
 const calls=[];
 await page.route('**/api/school-calendar?**',async route=>{
  const params=new URL(route.request().url()).searchParams;
  calls.push(params.get('mode')||'live');
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
 await ensurePracticalOpen(page);
 await page.locator('.family-reminder-municipal').waitFor({state:'visible'});
 const card=page.locator('.family-reminder-municipal');
 assert.match(await card.innerText(),/fredag 6. november/i);
 assert.match(await card.innerText(),/Fridag \(Sørlandsk lærerstevne\)/);
 assert.match(await card.innerText(),/SFO.*ikke oppgitt/i);
 assert.match(await card.innerText(),/lokale avvik/i);
 assert.equal(await card.locator('a').first().getAttribute('href'),
  'https://www.kristiansand.kommune.no/navigasjon/barnehage-og-skole/skole-og-sfo/skoleruta/');
 assert.equal(await page.locator('.family-reminder-municipal').count(),1);
 assert.deepEqual(calls.sort(),['live','snapshot'],
  'Exactly one fast snapshot and one live calendar request per school/week, not per child');
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
 await ensurePracticalOpen(page);
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
 await ensurePracticalOpen(page);
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
 await page.locator('#family-cards .family-mobile-progress-track:visible, #family-cards .family-child-progress:visible').waitFor({state:'visible'});
 const initialRequests=requests;
 await page.locator('#family-cards [data-family-compact-open]:visible, #family-cards [data-family-open]:visible').first().click();
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
 await page.locator('#landing-other-options').click();
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
 await page.locator('#family-mobile-admin-toggle').click();
 await page.locator('[data-family-more]').first().click();
 await page.locator('[data-family-edit]').click();
 await page.locator('#family-name').fill('Oppdatert profil');
 await page.locator('#family-save').click();
 assert.match(await page.locator('#family-cards').innerText(),/Oppdatert profil/);
 await page.locator('#family-return').click();
 assert.equal(await page.locator('#family-view').isVisible(),false);
 assert.equal(await page.locator('#school-gate').isVisible(),true);
 assert.deepEqual(errors,[]);
});

test('Verified parent can explicitly enable and disable Sunday email without a second email address',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844});
 const endpoint='https://testprojectabc.supabase.co';
 await page.route('**/api/account-config*',route=>reply(route,{
  enabled:true,url:endpoint+'/',publishableKey:'sb_publishable_test_not_a_real_key'
 }));
 await page.route('**/api/digest-config*',route=>reply(route,{available:true}));
 const testMailRequests=[];
 await page.route('**/api/digest-send-test*',route=>{
  testMailRequests.push({method:route.request().method(),
   authorization:route.request().headers().authorization});
  return route.fulfill({status:202,contentType:'application/json',
   body:JSON.stringify({status:'accepted',year:2026,week:45})});
 });
 await page.addInitScript(()=>{
  const original=window.fetch.bind(window);
  let enabled=false;
  const expires_at=Math.floor(Date.now()/1000)+3600;
  localStorage.setItem('ukeplanen.cloud.session.v1',JSON.stringify({
   access_token:'parent-access-token',refresh_token:'parent-refresh',
   expires_at,user:{id:'guardian-one',email:'parent@example.no'}
  }));
  window.__digestWrites=[];
  window.fetch=(input,init={})=>{
   const url=typeof input==='string'?input:input.url;
   if(!url.startsWith('https://testprojectabc.supabase.co/'))return original(input,init);
   let data={};
   if(url.includes('/auth/v1/user'))data={id:'guardian-one',email:'parent@example.no'};
   else if(url.includes('/rest/v1/families'))data=[{
    id:'family-1',name:'Skolefamilien',created_by:'guardian-one'
   }];
   else if(url.includes('/rest/v1/children'))data=[];
   else if(url.includes('/rest/v1/homework_progress'))data=[];
   else if(url.includes('/rest/v1/weekly_digest_subscriptions')){
    if(init.method==='POST'){
     const body=JSON.parse(init.body);enabled=Boolean(body.enabled);
     window.__digestWrites.push(body);
     data=[body];
    }else if(init.method==='DELETE'){enabled=false;window.__digestWrites.push({enabled:false});data=[];}
    else data=enabled?[{user_id:'guardian-one',enabled:true}]:[];
   }else return Promise.resolve(new Response(JSON.stringify({message:'Unexpected '+url}),{status:404}));
   return Promise.resolve(new Response(JSON.stringify(data),{
    status:200,headers:{'Content-Type':'application/json'}
   }));
  };
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#account-button').click();
 await page.locator('#account-digest-settings').waitFor({state:'visible'});
 const check=page.locator('#account-digest-optin');
 await check.waitFor({state:'visible'});
 await page.waitForFunction(()=>!document.getElementById('account-digest-optin').disabled);
 assert.equal(await check.isChecked(),false);
 await check.check();
 await page.getByText(/Du er påmeldt søndagsoppsummeringen/).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.__digestWrites),[{
  user_id:'guardian-one',enabled:true
 }]);
 const preview=page.locator('#account-digest-send-test');
 await page.waitForFunction(()=>!document.getElementById('account-digest-send-test').disabled);
 await preview.click();
 await page.getByText(/E-postleverandøren har godtatt testmailen/).waitFor();
 assert.deepEqual(testMailRequests,[{method:'POST',authorization:'Bearer parent-access-token'}]);
 await check.uncheck();
 await page.getByText(/E-postoppsummeringen er slått av/).waitFor();
 assert.equal(await check.isChecked(),false);
 await page.waitForFunction(()=>document.getElementById('account-digest-send-test').disabled);
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
  let families=JSON.parse(localStorage.getItem('__testFamilies')||'[]');
  let children=JSON.parse(localStorage.getItem('__testChildren')||'[]');
  window.__otpRequests=0;
  window.__verifyRequests=0;
  window.fetch=(input,init={})=>{
   const url=typeof input==='string'?input:input.url;
   if(!url.startsWith('https://testprojectabc.supabase.co/'))return original(input,init);
   let data={};
   if(url.includes('/auth/v1/otp')){window.__otpRequests++;data={};}
   else if(url.includes('/auth/v1/verify')){
    window.__verifyRequests++;
    if(window.__verifyRequests===1)return Promise.resolve(new Response(
     JSON.stringify({msg:'Token has expired or is invalid'}),{status:403,
      headers:{'Content-Type':'application/json'}}));
    data={access_token:'access-token',refresh_token:'refresh-token',expires_in:3600,
     user:{id:'guardian-one',email:'parent@example.no'}};
   }
   else if(url.includes('/rest/v1/rpc/create_family')){
    families=[{id:'family-1',name:'Min familie',created_by:'guardian-one'}];
    localStorage.setItem('__testFamilies',JSON.stringify(families));data='family-1';
   }else if(url.includes('/rest/v1/families'))data=families;
   else if(url.includes('/rest/v1/children')&&init.method==='POST'){
    const child=JSON.parse(init.body);children.push({...child,id:'child-'+(children.length+1)});
    localStorage.setItem('__testChildren',JSON.stringify(children));data=[children.at(-1)];
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
 assert.match(await page.locator('#account-heading').innerText(),/Logg inn på Skoleuka/);
 assert.equal(await page.locator('#account-steps').isVisible(),false,
  'Returning guardian should not see family registration steps');
 await page.locator('#account-close').click();
 await page.locator('#landing-create-family').click();
 assert.match(await page.locator('#account-heading').innerText(),/Kom i gang med Skoleuka/);
 assert.equal(await page.locator('#account-steps').isVisible(),true);
 assert.equal(await page.locator('[data-onboard-step="1"]').getAttribute('aria-current'),'step');
 await page.locator('#account-email').fill('parent@example.no');
 await page.locator('#account-send-code').click();
 await page.waitForTimeout(400);
 assert.equal(await page.locator('#account-verify-email').innerText(),'parent@example.no');
 assert.match(await page.locator('[data-account-screen="verify"]').innerText(),/søppelpost/i);
 assert.equal(await page.locator('[data-onboard-step="1"]').getAttribute('aria-current'),'step');
 assert.match(await page.locator('#account-message').textContent(),/sjekk e-posten/i,
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
 await page.locator('#account-code-error').getByText(/Koden er ugyldig eller har utløpt/).waitFor();
 assert.equal(await page.locator('#account-code').getAttribute('aria-invalid'),'true');
 assert.equal(await page.locator('[data-account-screen="verify"]').isVisible(),true);
 await page.locator('#account-code').fill('876543');
 assert.equal(await page.locator('#account-code-error').isVisible(),false);
 await page.locator('#account-verify').click();
 await page.locator('#account-family-name').waitFor({state:'visible'});
 assert.equal(await page.locator('[data-onboard-step="2"]').getAttribute('aria-current'),'step');
 assert.equal(await page.locator('#account-family-picker-row').isVisible(),false);
 assert.equal(await page.locator('#account-open-family').isVisible(),false);
 assert.equal(await page.locator('#account-family-name').isVisible(),true);
 await page.locator('#account-family-name').fill('Min familie');
 await page.locator('#account-create').click();
 await page.locator('[data-account-screen="children"]').waitFor({state:'visible'});
 assert.equal(await page.locator('[data-onboard-step="3"]').getAttribute('aria-current'),'step');
 assert.equal(await page.locator('#onboard-children-list .onboard-child-item').count(),0);
 assert.equal(await page.locator('#onboard-child-form').isVisible(),true);
 assert.match(await page.locator('[data-account-screen="children"]').innerText(),/Rød og Blå/);
 assert.equal(await page.locator('#onboard-import-row').isVisible(),false);
 await page.locator('#onboard-child-name').fill('Testbarn');
 await page.locator('#onboard-child-school').selectOption('sjostrand');
 await page.locator('#onboard-child-grade option[value="2"]').waitFor({state:'attached'});
 await page.locator('#onboard-child-grade').selectOption('2');
 await page.locator('#onboard-child-save').click();
 await page.locator('#onboard-children-list .onboard-child-item').first().waitFor();
 assert.equal(await page.locator('#onboard-children-list .onboard-child-item').count(),1);
 assert.equal(await page.locator('#onboard-child-form').isVisible(),true,
  'Adding one child must not close the form or make a second child hard to add');
 assert.match(await page.locator('#onboard-child-form-title').innerText(),/barn til/);
 assert.match(await page.locator('#onboard-children-next').innerText(),/Ferdig med barna/);
 assert.equal(await page.locator('#onboard-child-name').inputValue(),'');
 assert.equal(await page.locator('#onboard-child-school').inputValue(),'sjostrand');
 // Sibling on the same school: reuse the school while allowing a different grade.
 assert.equal(await page.locator('#onboard-child-grade').inputValue(),'2');
 await page.locator('#onboard-child-name').fill('Andre barn');
 await page.locator('#onboard-child-grade').selectOption('5A');
 await page.locator('#onboard-child-save').click();
 await page.locator('#onboard-children-list .onboard-child-item').nth(1).waitFor();
 assert.equal(await page.locator('#onboard-children-list .onboard-child-item').count(),2);
 assert.match(await page.locator('#onboard-children-list').innerText(),/Andre barn/);
 assert.match(await page.locator('#onboard-children-list').innerText(),/5A/);
 assert.equal(await page.locator('#onboard-child-form').isVisible(),true);
 assert.equal(await page.locator('#onboard-child-name').inputValue(),'');
 await page.locator('#onboard-children-next').click();
 assert.equal(await page.locator('[data-account-screen="completed"]').isVisible(),true);
 assert.equal(await page.locator('[data-onboard-step="4"]').getAttribute('aria-current'),'step');
 await page.locator('#onboard-dashboard').click();
 await page.locator('#family-view').waitFor({state:'visible'});
 assert.equal(await page.locator('body').evaluate(x=>x.classList.contains('family-cloud-active')),true,
  'An authenticated family must activate the simplified mobile navigation');
 assert.equal(await page.locator('.primary-nav').isVisible(),false,
  'No Forside / Min familie / Ukeplan fixed bar for a signed-in family');
 assert.equal(await page.locator('#family-cards .family-child').count(),2);
 assert.equal(await page.locator('#account-current-family').textContent(),'Min familie');
 assert.match(await page.locator('#family-storage-label').textContent(),/Synkronisert familie/);
 assert.equal(await page.locator('#family-first-run').isVisible(),true);
 assert.match(await page.locator('#family-first-run-next').innerText(),/Åpne ukeplanen til Testbarn/);
 assert.equal(await page.locator('[data-first-run-step="family"].is-done').count(),1);
 assert.equal(await page.locator('[data-first-run-step="child"].is-done').count(),1);
 assert.equal(await page.locator('[data-first-run-step="plan"].is-done').count(),0);
 // Guide survives an accidental reload during the first visit.
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#family-first-run').waitFor({state:'visible'});
 assert.equal(await page.locator('#family-cards .family-child').count(),2,
  'Both children must still exist after a fresh guardian session restoration');
 await page.locator('#family-first-run-dismiss').click();
 assert.equal(await page.locator('#family-first-run').isVisible(),false);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#family-view').waitFor({state:'visible'});
 assert.equal(await page.locator('#family-first-run').isVisible(),false,
  'A dismissed onboarding tip must not return to an existing family');
 assert.deepEqual(errors,[]);
});

test('Mobile guardian invitation guides a signed-in newcomer to join rather than create a duplicate family',async t=>{
 const {page,errors}=await openPage(t,{width:320,height:700});
 const endpoint='https://testprojectabc.supabase.co';
 await page.route('**/api/account-config*',route=>reply(route,{
  enabled:true,url:endpoint+'/',publishableKey:'sb_publishable_test_not_a_real_key'
 }));
 await page.addInitScript(()=>{
  const original=window.fetch.bind(window);
  localStorage.setItem('ukeplanen.cloud.session.v1',JSON.stringify({
   access_token:'guardian-access',refresh_token:'guardian-refresh',
   expires_at:Math.floor(Date.now()/1000)+3600,
   user:{id:'new-guardian',email:'new@example.no'}
  }));
  window.fetch=(input,init={})=>{
   const url=typeof input==='string'?input:input.url;
   if(!url.startsWith('https://testprojectabc.supabase.co/'))return original(input,init);
   let data=[];
   if(url.includes('/auth/v1/user'))data={id:'new-guardian',email:'new@example.no'};
   if(url.includes('/rest/v1/families'))data=[];
   return Promise.resolve(new Response(JSON.stringify(data),{
    status:200,headers:{'Content-Type':'application/json'}
   }));
  };
 });
 await page.goto(server.baseURL+'/#invite='+'a'.repeat(64),{waitUntil:'domcontentloaded'});
 // A hash-only navigation on the already-loaded test page does not re-run
 // the bootstrap. A real opened invitation link loads a fresh document.
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#account-invite-prompt').waitFor({state:'visible'});
 assert.match(await page.locator('#account-heading').innerText(),/Godta familieinvitasjonen/);
 assert.equal(await page.locator('#account-empty-family').isVisible(),false);
 assert.equal(await page.locator('#account-invite-accept').isVisible(),true);
 assert.equal(await page.locator('#account-family-picker-row').isVisible(),false);
 const fits=await page.locator('#account-panel').evaluate(el=>el.scrollWidth<=el.clientWidth+1);
 assert.equal(fits,true,'Invitation flow must not scroll horizontally at 320px');
 assert.deepEqual(errors,[]);
});

test('Opening a family child plan from a scrolled overview starts the new view at the top',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:620});
 await page.evaluate(()=>localStorage.setItem('ukeplanen.family.v2',JSON.stringify({
  version:2,profiles:[{id:'child-scroll-001',name:'Barn A',school:'sjostrand',grade:'2',group:''}]
 })));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#family-cards .family-child').waitFor({state:'visible'});
 await page.evaluate(()=>{
  const spacer=document.createElement('div');spacer.style.height='1600px';spacer.id='test-scroll-space';
  document.body.append(spacer);
  window.scrollTo({top:650,behavior:'instant'});
 });
 assert.ok(await page.evaluate(()=>window.scrollY)>200);
 await page.locator('#family-cards [data-family-compact-open]:visible, #family-cards [data-family-open]:visible').first().click();
 await page.locator('#app-view').waitFor({state:'visible'});
 await page.waitForFunction(()=>window.scrollY===0);
 assert.equal(await page.evaluate(()=>window.scrollY),0);
 // Browser back should not inherit the child-plan's old scroll position.
 await page.evaluate(()=>window.scrollTo({top:720,behavior:'instant'}));
 assert.ok(await page.evaluate(()=>window.scrollY)>200);
 await page.goBack();
 await page.locator('#family-view').waitFor({state:'visible'});
 await page.waitForFunction(()=>window.scrollY===0);
 assert.deepEqual(errors,[]);
});

test('Account opens as a blocking modal and X or Escape restores underlying position and focus',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:620});
 await page.evaluate(()=>{
  const spacer=document.createElement('div');spacer.style.height='1900px';spacer.id='test-scroll-space';
  document.body.append(spacer);
  const account=document.getElementById('account-button');
  account.focus({preventScroll:true});
  window.scrollTo({top:680,behavior:'instant'});
  account.click();
 });
 await page.locator('#account-panel').waitFor({state:'visible'});
 const state=await page.evaluate(()=>({
  modal:document.getElementById('account-panel').matches(':modal'),
  open:document.getElementById('account-panel').open,
  backgroundLocked:document.body.classList.contains('account-modal-open'),
  bodyPosition:getComputedStyle(document.body).position,
  lockTop:document.body.style.getPropertyValue('--account-lock-top'),
  expanded:document.getElementById('account-button').getAttribute('aria-expanded'),
  focusInside:document.getElementById('account-panel').contains(document.activeElement)
 }));
 assert.equal(state.modal,true);assert.equal(state.open,true);
 assert.equal(state.backgroundLocked,true);assert.equal(state.bodyPosition,'fixed');
 assert.equal(state.lockTop,'-680px');assert.equal(state.expanded,'true');
 assert.equal(state.focusInside,true);
 await page.mouse.wheel(0,600);
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body).position),'fixed');
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.getElementById('account-panel').open&&window.scrollY===680);
 assert.equal(await page.locator('#account-button').getAttribute('aria-expanded'),'false');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'account-button');
 await page.evaluate(()=>document.getElementById('account-button').click());
 await page.locator('#account-panel').waitFor({state:'visible'});
 await page.locator('#account-close').click();
 await page.waitForFunction(()=>!document.getElementById('account-panel').open&&window.scrollY===680);
 assert.equal(await page.evaluate(()=>document.body.classList.contains('account-modal-open')),false);
 assert.equal(await page.evaluate(()=>document.activeElement.id),'account-button');
 assert.deepEqual(errors,[]);
});

test('Family activities can be added, edited, repeated and persist locally without an account',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:740});
 await page.locator('#family-toggle').click();
 await page.locator('[data-family-mobile-tab="activities"]').click();
 await page.locator('#family-activity-add').click();
 await page.locator('#family-activity-name').fill('Korpsøvelse');
 await page.locator('#family-activity-date').fill('2026-10-26');
 await page.locator('#family-activity-start').fill('17:00');
 await page.locator('#family-activity-end').fill('18:30');
 await page.locator('#family-activity-repeat').selectOption('weekly');
 assert.equal(await page.locator('#family-activity-until-wrap').isVisible(),true);
 await page.locator('#family-activity-until').fill('2026-11-30');
 await page.locator('#family-activity-location').fill('Musikkrommet');
 await page.locator('#family-activity-responsible').fill('Pappa');
 await page.locator('#family-activity-save').click();
 await page.locator('#family-activity-manage > summary').click();
 await page.locator('#family-activity-list').getByText('Korpsøvelse').waitFor();
 assert.match(await page.locator('#family-activity-list').innerText(),/17:00–18:30/);
 assert.match(await page.locator('#family-activity-list').innerText(),/Ukentlig/);
 assert.match(await page.locator('#family-activity-list').innerText(),/Pappa/);
 await page.reload({waitUntil:'domcontentloaded'});
 // The family section now restores directly after reload, without a detour.
 await page.locator('#family-view').waitFor({state:'visible'});
 assert.equal(await page.locator('#family-toggle').getAttribute('aria-pressed'),'true');
 await page.locator('#family-activity-manage > summary').click();
 await page.locator('#family-activity-list').getByText('Korpsøvelse').waitFor();
 await page.locator('[data-activity-edit]').first().click();
 assert.equal(await page.locator('#family-activity-repeat').inputValue(),'weekly');
 await page.locator('#family-activity-name').fill('Korps og noter');
 await page.locator('#family-activity-save').click();
 await page.locator('#family-activity-manage > summary').click();
 await page.locator('#family-activity-list').getByText('Korps og noter').waitFor();
 assert.doesNotMatch(await page.locator('#family-activity-list').innerText(),/Korpsøvelse/);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('[data-activity-delete]').click();
 await page.locator('#family-activity-list').getByText(/Ingen aktiviteter/).waitFor();
 assert.deepEqual(errors,[]);
});
test('Family activity dates and optional end time are validated before saving',async t=>{
 const {page,errors}=await openPage(t);
 await page.locator('#family-toggle').click();
 await page.locator('#family-activity-add').click();
 await page.locator('#family-activity-name').fill('Turnering');
 await page.locator('#family-activity-date').fill('2026-10-28');
 await page.locator('#family-activity-start').fill('19:00');
 await page.locator('#family-activity-end').fill('17:00');
 await page.locator('#family-activity-save').click();
 assert.match(await page.locator('#family-activity-form-status').innerText(),/etter start/);
 assert.equal(await page.locator('#family-activity-form').isVisible(),true);
 assert.equal(await page.locator('#family-activity-list .family-activity-card').count(),0);
 assert.deepEqual(errors,[]);
});

test('Family calendar displays four typed sources, verified homework, optional weekend and sibling filter',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:844,mockNow:'2026-10-28T10:00:00Z'});
 const profiles=[
  {id:'child-agenda-red-001',name:'Barn Rød',school:'sjostrand',grade:'2',group:'Rød'},
  {id:'child-agenda-blue-002',name:'Barn Blå',school:'sjostrand',grade:'2',group:'Blå'}
 ];
 await page.evaluate(profiles=>{
  localStorage.setItem('ukeplanen.family.v2',JSON.stringify({version:2,profiles}));
  localStorage.setItem('ukeplanen.family.activities.v1',JSON.stringify([
   {id:'family-activity-weekend',title:'Søndagskonsert',child_id:profiles[0].id,
    occurs_on:'2026-11-01',start_time:'12:30',repeat_rule:'none',repeat_until:null},
   {id:'family-activity-shared',title:'Felles middag',child_id:null,
    occurs_on:'2026-10-27',start_time:'17:00',repeat_rule:'weekly',repeat_until:null}
  ]));
 },profiles);
 await page.route('**/api/plan?**',route=>{
  const plan={...basePlan('2'),year:2026,week:44,homework:[
   {text:'Les sidene 30–33',subject:'Norsk',dueDay:'Torsdag',group:'Rød'},
   {text:'Lær gloser',subject:'Engelsk',dueDay:'Fredag',group:'Blå'},
   {text:'Øv på gangetabellen',subject:'Matte'}
  ],dayNotes:{Tirsdag:[{text:'Vaksinasjon tirsdag – husk samtykke',group:'Rød'}]},
  days:{...basePlan('2').days,Fredag:{bring:[],events:[]}},
  notices:['Husk informasjonsskriv fra skolen']};
  return reply(route,plan);
 });
 await page.route('**/api/school-calendar?**',route=>reply(route,{
  schoolId:'sjostrand',year:2026,week:44,sourceStatus:'live',events:[
   {date:'2026-10-30',label:'Planleggingsdag – skolefri',schoolFree:true,sfoClosed:false}
  ]
 }));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('[data-family-mobile-tab="calendar"]').click();
 await setFamilyCalendarWholeWeek(page);
 await page.locator('#family-agenda-days .family-agenda-item').first().waitFor();
 assert.equal(await page.locator('.family-agenda-day').count(),5);
 assert.equal(await page.locator('[data-family-mobile-weekend]').evaluate(el=>el.hidden),false);
 assert.equal(await page.locator('#family-agenda-weekend-toggle').getAttribute('aria-expanded'),'false');
 assert.doesNotMatch(await page.locator('#family-agenda-days').innerText(),/Søndagskonsert/);
 assert.match(await page.locator('#family-agenda-days').innerText(),/Planleggingsdag/);
 assert.match(await page.locator('#family-agenda-days').innerText(),/Vaksinasjon/);
 assert.match(await page.locator('#family-agenda-days').innerText(),/Les sidene 30/);
 assert.match(await page.locator('#family-agenda-days').innerText(),/Lær gloser/);
 assert.doesNotMatch(await page.locator('#family-agenda-days').innerText(),/Gymtøy|Øv på gangetabellen/);
 for(const kind of ['homework','practical','activity','municipal']){
  assert.ok(await page.locator('#family-agenda-days .family-agenda-item.content-kind-'+kind).count()>0,
   'Expected separate calendar type: '+kind);
 }
 assert.match(await page.locator('#family-agenda-days').innerText(),/Felles middag/);
 assert.equal(await page.locator('#family-agenda-days .family-agenda-item.kind-family').count(),1);
 await toggleFamilyCalendarWeekend(page);
 await page.locator('#family-agenda-days').getByText('Søndagskonsert').waitFor();
 assert.equal(await page.locator('.family-agenda-day').count(),7);
 assert.equal(await page.locator('#family-agenda-days .family-agenda-item.kind-family').count(),2);
 assert.equal(await page.locator('#family-agenda-weekend-toggle').getAttribute('aria-expanded'),'true');
 await toggleFamilyCalendarWeekend(page);
 assert.equal(await page.locator('.family-agenda-day').count(),5);
 assert.equal(await page.locator('#family-agenda-days a[href*="minskole.no"]').count()>0,true);
 assert.equal(await page.locator('#family-agenda-undated').evaluate(el=>el.open),false);
 await page.locator('#family-agenda-undated > summary').click();
 await page.locator('#family-agenda-undated').getByText('Husk informasjonsskriv fra skolen').first().waitFor();
 assert.doesNotMatch(await page.locator('#family-agenda-undated').innerText(),/Øv på gangetabellen/);
 assert.equal(await page.locator('#family-agenda-undated').isVisible(),true);
 await page.locator('#family-agenda-child').selectOption(profiles[1].id);
 const filtered=await page.locator('#family-agenda-days').innerText();
 assert.match(filtered,/Lær gloser/);
 assert.doesNotMatch(filtered,/Les sidene 30|Gymtøy/);
 assert.match(filtered,/Felles middag/);
 assert.match(filtered,/Planleggingsdag/);
 assert.doesNotMatch(filtered,/Søndagskonsert|Les sidene 30|Vaksinasjon/);
 assert.equal(await page.locator('[data-family-mobile-weekend]').evaluate(el=>el.hidden),true);
 await page.locator('#family-agenda-child').selectOption(profiles[0].id);
 assert.equal(await page.locator('.family-agenda-day').count(),5);
 assert.equal(await page.locator('[data-family-mobile-weekend]').evaluate(el=>el.hidden),false);
 await toggleFamilyCalendarWeekend(page);
 assert.match(await page.locator('#family-agenda-days').innerText(),/Søndagskonsert/);
 assert.doesNotMatch(await page.locator('#family-agenda-days').innerText(),/Lær gloser/);
 assert.deepEqual(errors,[]);
});

test('Editing a family event in the combined week immediately updates the timeline without erasing school content',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:780,mockNow:'2026-10-28T10:00:00Z'});
 await page.evaluate(()=>{
  localStorage.setItem('ukeplanen.family.v2',JSON.stringify({
   version:2,profiles:[{id:'child-agenda-001',name:'Barn A',school:'sjostrand',grade:'2',group:''}]
  }));
  localStorage.setItem('ukeplanen.family.activities.v1',JSON.stringify([
   {id:'activity-agenda-001',title:'Fotballtrening',child_id:null,occurs_on:'2026-10-29',
    start_time:'17:00',repeat_rule:'weekly',repeat_until:null}
  ]));
 });
 await page.route('**/api/plan?**',route=>reply(route,{
  ...basePlan('2'),homework:[{text:'Les leksa',subject:'Norsk',dueDay:'Torsdag'}],
  dayNotes:{Torsdag:[{text:'Foreldremøte torsdag – kl. 18'}]}
 }));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('[data-family-mobile-tab="calendar"]').click();
 await setFamilyCalendarWholeWeek(page);
 await page.locator('#family-agenda-days .family-agenda-item.kind-family').first().waitFor({state:'visible'});
 await expandFirstFamilyActivity(page);
 await page.locator('#family-agenda-days [data-family-agenda-edit]').first().click();
 assert.equal(await page.locator('#family-activity-section').isVisible(),true);
 await page.locator('#family-activity-name').fill('Fotball – ny tid');
 await page.locator('#family-activity-start').fill('18:00');
 await page.locator('#family-activity-save').click();
 await page.locator('[data-family-mobile-tab="calendar"]').click();
 await page.locator('#family-agenda-days').getByText('Fotball – ny tid').waitFor();
 assert.match(await page.locator('#family-agenda-days').innerText(),/Foreldremøte/);
 assert.match(await page.locator('#family-agenda-days').innerText(),/Les leksa/);
 assert.equal(await page.locator('#family-agenda-days .family-agenda-item.content-kind-homework').count(),1);
 assert.match(await page.locator('#family-agenda-days').innerText(),/18:00/);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#family-agenda-days').getByText('Fotball – ny tid').waitFor();
 assert.deepEqual(errors,[]);
});

async function ensurePracticalOpen(page){
 const detail=page.locator('#family-practical-details');
 if(await detail.count()&&!(await detail.evaluate(el=>el.open)))
  await page.locator('#family-practical-details > summary').click();
}

test('Skoleuka 2.2 mobile hierarchy makes children and critical notices prominent without losing original sources',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:740,mockNow:'2026-10-28T10:00:00Z'});
 await page.evaluate(()=>localStorage.setItem('ukeplanen.family.v2',JSON.stringify({
  version:2,profiles:[{id:'child-2-2-red',name:'Barn Rød',school:'sjostrand',grade:'2',group:'Rød'}]
 })));
 await page.route('**/api/plan?**',route=>reply(route,{
  ...basePlan('2'),year:2026,week:44,
  notices:[{text:'Vaksinasjon denne uka – husk samtykkeskjema',group:'Rød'}],
  homework:[{subject:'Norsk',text:'Les et kapittel',dueDay:'Torsdag',group:'Rød'}]
 }));
 await page.route('**/api/school-calendar?**',route=>reply(route,{
  schoolId:'sjostrand',year:2026,week:44,sourceStatus:'live',events:[
   {date:'2026-10-30',label:'Planleggingsdag – elevene har fri',schoolFree:true,sfoClosed:false}
  ]
 }));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#family-important-cards').getByText(/Planleggingsdag/).waitFor({state:'visible'});
 await page.locator('#family-mobile-important-more').click();
 await page.locator('#family-important-cards').getByText(/Vaksinasjon/).waitFor({state:'visible'});
 const snapshot=await page.evaluate(()=>{
  const top=id=>document.querySelector(id).getBoundingClientRect().top;
  return {people:top('#family-children'),alerts:top('.family-important'),
   week:top('.family-agenda'),manage:top('#family-activity-section'),
   extra:document.querySelector('#family-cards .family-child-extra').open,
   reminders:document.querySelector('#family-practical-details').open,
   activity:document.querySelector('#family-activity-manage').open,
   undated:document.querySelector('#family-agenda-undated').open};
 });
 assert.ok(snapshot.people<snapshot.alerts);
 assert.equal(await page.locator('.family-agenda').isVisible(),false);
 assert.equal(await page.locator('#family-activity-section').isVisible(),false);
 assert.equal(snapshot.extra,false);
 assert.equal(snapshot.reminders,false);
 assert.equal(snapshot.activity,false);
 assert.equal(snapshot.undated,false);
 assert.equal(await page.locator('#family-cards .family-mobile-progress-track:visible, #family-cards .family-child-progress:visible').count(),1);
 assert.equal(await page.locator('#family-cards [data-family-compact-open]:visible, #family-cards [data-family-open]:visible').first().isVisible(),true);
 assert.equal(await page.locator('#family-important-cards a[href*="minskole.no"]').count()>0,true);
 assert.match(await page.locator('#family-agenda-undated-summary').innerText(),/viktig/);
 await page.locator('[data-family-mobile-tab="calendar"]').click();
 await page.locator('#family-agenda-undated>summary').click();
 assert.equal(await page.locator('#family-agenda-undated').evaluate(el=>el.open),true);
 assert.match(await page.locator('#family-agenda-undated-list').innerText(),/Vaksinasjon/);
 await page.locator('[data-family-mobile-tab="overview"]').click();
 await page.locator('#family-practical-details>summary').click();
 assert.equal(await page.locator('#family-practical-details').evaluate(el=>el.open),true);
 await page.locator('#family-reminders').getByText(/Vaksinasjon/).first().waitFor({state:'visible'});
 assert.deepEqual(errors,[]);
});

test('2.2 family administration is minimized and opens the correct editor from calendar',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:740,mockNow:'2026-10-28T10:00:00Z'});
 await page.evaluate(()=>{
  localStorage.setItem('ukeplanen.family.v2',JSON.stringify({version:2,profiles:[
   {id:'child-2-2-act',name:'Barn A',school:'sjostrand',grade:'2',group:''}
  ]}));
  localStorage.setItem('ukeplanen.family.activities.v1',JSON.stringify([
   {id:'2-2-activity-1',title:'Korpsøvelse',child_id:null,occurs_on:'2026-10-28',
    repeat_rule:'weekly',repeat_until:null,start_time:'17:00',end_time:null}
  ]));
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('[data-family-mobile-tab="calendar"]').click();
 await setFamilyCalendarWholeWeek(page);
 await page.locator('#family-agenda-days').getByText('Korpsøvelse').waitFor({state:'visible'});
 assert.equal(await page.locator('#family-activity-manage').evaluate(el=>el.open),false);
 assert.match(await page.locator('#family-activity-manage-summary').innerText(),/1 aktivitet/);
 assert.equal(await page.locator('#family-activity-form').isVisible(),false);
 await page.locator('[data-family-mobile-tab="activities"]').click();
 await page.locator('#family-activity-manage>summary').click();
 await page.locator('#family-activity-list').getByText('Korpsøvelse').waitFor({state:'visible'});
 await page.locator('[data-family-mobile-tab="calendar"]').click();
 await expandFirstFamilyActivity(page);
 await page.locator('#family-agenda-days [data-family-agenda-edit]').click();
 assert.equal(await page.locator('#family-activity-manage').evaluate(el=>el.open),false);
 assert.equal(await page.locator('#family-activity-form').isVisible(),true);
 await page.locator('#family-activity-name').fill('Korps – ny øving');
 await page.locator('#family-activity-save').click();
 await page.locator('[data-family-mobile-tab="calendar"]').click();
 await page.locator('#family-agenda-days').getByText('Korps – ny øving').waitFor({state:'visible'});
 assert.equal(await page.locator('#family-activity-form').isVisible(),false);
 assert.equal(await page.locator('#family-activity-manage').evaluate(el=>el.open),false);
 await page.locator('[data-family-mobile-tab="activities"]').click();
 await page.locator('#family-activity-add').click();
 assert.equal(await page.locator('#family-activity-form').isVisible(),true);
 await page.locator('#family-activity-cancel').click();
 assert.equal(await page.locator('#family-activity-form').isVisible(),false);
 assert.deepEqual(errors,[]);
});

test('Opening a saved child plan hides school/grade switching and shows only that child’s daily family events',async t=>{
 const {page,errors}=await openPage(t,{width:390,height:760,mockNow:'2026-10-28T10:00:00Z'});
 const child1='saved-child-a-001',child2='saved-child-b-002';
 await page.evaluate(([a,b])=>{
  localStorage.setItem('ukeplanen.family.v2',JSON.stringify({version:2,profiles:[
   {id:a,name:'Barn A',school:'sjostrand',grade:'2',group:'Rød'},
   {id:b,name:'Barn B',school:'sjostrand',grade:'2',group:'Blå'}
  ]}));
  localStorage.setItem('ukeplanen.family.activities.v1',JSON.stringify([
   {id:'a',title:'Korps etter skolen',child_id:a,occurs_on:'2026-10-28',
    repeat_rule:'weekly',repeat_until:null,start_time:'17:00',location:'Musikkrommet'},
   {id:'b',title:'Søskenets aktivitet',child_id:b,occurs_on:'2026-10-28',
    repeat_rule:'none',repeat_until:null,start_time:'18:00'},
   {id:'all',title:'Felles middag',child_id:null,occurs_on:'2026-10-28',
    repeat_rule:'none',repeat_until:null,start_time:'19:00'}
  ]));
 },[child1,child2]);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#family-cards [data-family-compact-open]:visible, #family-cards [data-family-open]:visible').first().click();
 await page.locator('#app-view').waitFor({state:'visible'});
 await page.locator('#plan-day-activities').waitFor({state:'visible'});
 assert.equal(await page.locator('#change-school').isVisible(),false);
 assert.equal(await page.locator('#change-grade').isVisible(),false);
 assert.equal(await page.locator('#mobile-selection-menu').isVisible(),false);
 assert.equal(await page.locator('#plan-back-family').isVisible(),true);
 assert.match(await page.locator('#plan-welcome-title').innerText(),/Barn A/);
 assert.match(await page.locator('#plan-day-activity-list').innerText(),/Korps etter skolen/);
 assert.match(await page.locator('#plan-day-activity-list').innerText(),/Felles middag/);
 assert.doesNotMatch(await page.locator('#plan-day-activity-list').innerText(),/Søskenets aktivitet/);
 await page.locator('#plan-back-family').click();
 await page.locator('#family-view').waitFor({state:'visible'});
 assert.deepEqual(errors,[]);
});
