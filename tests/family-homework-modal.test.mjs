import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {profileSummary} from '../public/shared/family-core.mjs';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/family-ui.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/family-homework-dialog.css',import.meta.url),'utf8');

test('The family progress trigger is a keyboard-accessible dialog button',()=>{
 assert.match(html,/<button id="family-homework-open"[^>]*aria-haspopup="dialog"[^>]*aria-controls="family-homework-dialog"/);
 assert.match(html,/<dialog id="family-homework-dialog"[^>]*aria-modal="true"/);
 assert.match(html,/id="family-homework-close"/);
 assert.match(js,/homeworkDialog\.showModal\(\)/);
 assert.match(js,/homeworkDialog\.addEventListener\('close'/);
 assert.match(js,/homeworkReturnFocus\?\.focus\(\{preventScroll:true\}\)/);
});
test('Modal and child cards use exactly the same completion summary',()=>{
 assert.match(js,/const \{now,summaries\}=getSummaries\(\);/);
 assert.match(js,/renderHomeworkModal\(now,summaries\);/);
 assert.match(js,/summary\.tasks\.filter/);
 assert.match(js,/const tasks=summary\.tasks/);
 assert.match(js,/changeHomeworkCheck\(p,index,input\.checked\)/);
 assert.match(js,/await updateCloud\(p,task,value\)/);
 assert.match(js,/childProgressKey\(p,now\.year,now\.week,'homework'\)/);
 assert.match(js,/initialProgressPending/);
});
test('Missing school plans stay explicitly incomplete; mobile layout supports full-height dialog',()=>{
 assert.match(js,/Oversikten kan være ufullstendig/);
 assert.match(js,/Ukeplanen er ikke tilgjengelig ennå/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/height:100dvh/);
 assert.match(css,/family-homework-task-grid\{grid-template-columns:minmax\(0,1fr\)/);
});
test('Task counts are based on the identical public plan source',()=>{
 const profile={id:'test-child',school:'fagerholt',grade:'3',name:'Test'};
 const plan={schoolId:'fagerholt',grade:'3',year:2026,week:46,status:'ok',aiStatus:'ready',
  homework:[{subject:'Matte',text:'Gjør matematikk'},{subject:'Norsk',text:'Les'}],days:{},
  everyday:[],notices:[]};
 const cal={year:2026,week:46,weekday:1};
 const summary=profileSummary(profile,plan,cal,()=>null);
 assert.equal(summary.total,2);
 assert.equal(summary.tasks.length,2);
 assert.equal(summary.done,0);
});
