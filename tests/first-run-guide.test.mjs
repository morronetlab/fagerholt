import test from 'node:test';
import assert from 'node:assert/strict';
import {firstRunGuideState} from '../public/shared/first-run-guide.mjs';

test('First-time setup without a child tells the parent the one missing step',()=>{
 const guide=firstRunGuideState([]);
 assert.equal(guide.stage,'add-child');
 assert.equal(guide.childId,null);
 assert.match(guide.primary,/Legg til første barn/);
 assert.deepEqual(guide.checklist,[true,false,false]);
});
test('First-time setup with a child opens that child's week plan, not a school picker',()=>{
 const guide=firstRunGuideState([{id:'a1',name:'Ailin'},{id:'b2',name:'Maya'}]);
 assert.equal(guide.stage,'open-plan');
 assert.equal(guide.childId,'a1');
 assert.match(guide.primary,/Ailin/);
 assert.match(guide.description,/Kalender/);
 assert.deepEqual(guide.checklist,[true,true,false]);
});
test('Malformed or absent children do not result in an actionable invalid link',()=>{
 const guide=firstRunGuideState([{id:null,name:'Broken'},{}]);
 assert.equal(guide.childId,null);
});
