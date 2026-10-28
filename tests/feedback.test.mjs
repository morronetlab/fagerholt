import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planFeedback} from '../public/shared/plan-feedback.mjs';
const school={name:'Fagerholt skole',homepage:'https://www.minskole.no/fagerholt'};
const url='https://www.minskole.no/fagerholt/seksjon/22637';
const mk=(plan,error=null)=>planFeedback({school,grade:'4',plan,error});

test('AI processing has a prominent explanatory banner while keeping interim content',()=>{
 const x=mk({status:'ok',aiStatus:'processing',pdf:'https://www.minskole.no/week44.pdf',week:44});
 assert.equal(x.kind,'analyzing');assert.equal(x.hideContent,false);
 assert.match(x.title,/AI analyserer · foreløpig ukeplan/);
 assert.match(x.description,/lekser, pakkeliste/);
 assert.equal(x.showSchool,false);
});
test('unpublished PDF has a clear school CTA and hides empty schedule widgets',()=>{
 const x=mk({status:'unpublished',source:url,week:44});
 assert.equal(x.kind,'missing');assert.equal(x.hideContent,true);
 assert.equal(x.showSchool,true);assert.equal(x.showGrade,true);
 assert.match(x.description,/Fagerholt skole/);assert.match(x.title,/ingen ukeplan/i);
});
test('missing grade page has direct official school action',()=>{
 const x=mk({status:'unavailable',source:school.homepage,week:44});
 assert.equal(x.kind,'missing');assert.equal(x.showSchool,true);assert.equal(x.showGrade,false);
 assert.match(x.description,/trinnside/);
});
test('unreadable PDF offers original and retry rather than empty cards',()=>{
 const x=mk({status:'unreadable',pdf:'https://www.minskole.no/week44.pdf'});
 assert.equal(x.kind,'missing');assert.equal(x.showGrade,true);assert.equal(x.hideContent,true);
});
test('network failure offers school link without claiming PDF missing',()=>{
 const x=mk(null,'HTTP 502');assert.equal(x.kind,'missing');
 assert.match(x.title,/utilgjengelig/);assert.doesNotMatch(x.description,/ikke.*PDF/);
});
test('completed AI and unavailable selection do not display feedback',()=>{
 assert.equal(mk({status:'ok',aiStatus:'ready'}),null);
 assert.equal(planFeedback({school:null,grade:'4',plan:{status:'unpublished'}}),null);
 assert.equal(planFeedback({school,grade:null,plan:{status:'unpublished'}}),null);
});
test('UI provides accessible animated feedback, safe outbound links and empty-grade CTA',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/original-look.css',import.meta.url),'utf8');
 for(const id of ['plan-feedback','plan-body','feedback-title','feedback-school-link','feedback-grade-link','feedback-retry','grade-missing','grade-school-link'])assert.match(html,new RegExp(`id="${id}"`));
 assert.match(html,/aria-live="polite"/);
 assert.match(html,/rel="noopener noreferrer"/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/feedback-scan/);
 assert.match(js,/renderFeedback\(\)/);
 assert.match(js,/\$\('plan-body'\)\.hidden=Boolean\(info\?\.hideContent\)/);
 assert.match(js,/\$\('feedback-school-link'\)\.href=state\.school\.homepage/);
 assert.match(js,/\$\('feedback-retry'\)\.addEventListener/);
});
