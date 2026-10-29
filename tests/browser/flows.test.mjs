/** Real Chromium smoke tests with mocked school APIs; no live school data or API cost. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';

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
 await page.locator('#school-search').fill('Sjøstrand');
 await page.locator('[data-school="sjostrand"]').click();
 await page.locator('[data-grade="'+grade+'"]').click();
 await page.locator('#school-name').waitFor({state:'visible'});
}
test('English-to-Norwegian quiz appears for Sjøstrand 5A and validates meaning in a browser',async t=>{
 const {page,errors}=await openPage(t);
 await chooseSchoolGrade(page,'5A');
 await page.locator('#word-quiz').waitFor({state:'visible'});
 assert.match(await page.locator('#vocabulary-title').textContent(),/Engelske ord/);
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
