/** Real Chromium smoke tests with mocked school APIs; no live school data or API cost. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {schoolCalendar} from '../../public/shared/calendar.mjs';

const DAYS=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
let browser,server;
before(async()=>{server=await startStaticServer();browser=await chromium.launch({headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();await server?.close();});

const basePlan=grade=>{
 const days=Object.fromEntries(DAYS.map(d=>[d,{events:[{title:'Skolearbeid',time:'08:30'}],bring:[]}]));
 if(grade==='2')days.Fredag.bring=[{label:'Gymsko'}];
 return {
  grade,week:44,year:2026,source:'https://www.minskole.no/sjostrand/seksjon/22175',
  pdf:'https://www.minskole.no/DynamicContent/Documents/uke44.pdf',
  status:'ok',parser:'ai',aiStatus:'ready',days,
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
async function openPage(t,{width=1280,height=850,processing=false}={}){
 const context=await browser.newContext({viewport:{width,height},locale:'nb-NO',timezoneId:'Europe/Oslo'});
 t.after(()=>context.close());
 const page=await context.newPage();
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
 const {page,errors}=await openPage(t,{width:390,height:844});
 const current=schoolCalendar(new Date(),'Europe/Oslo');
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
 assert.match(await page.locator('#family-reminders').innerText(),/Les en bok fra skolen/);
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
