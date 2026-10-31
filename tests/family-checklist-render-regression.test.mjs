import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../public/family-ui.mjs',import.meta.url),'utf8');

test('Guardian homework checklist uses the summary checked flag, not packing-only variables',()=>{
 const start=source.indexOf('const taskList=');
 const end=source.indexOf('function childCard(',start);
 assert.ok(start>=0&&end>start);
 const taskList=source.slice(start,end);
 assert.match(taskList,/x\.checked\?'checked '/);
 assert.doesNotMatch(taskList,/bagChecks|bagKey\(|\bnow\b|\bday\b/);
});
test('Guardian packing checkbox reads shared packing state within the child card scope',()=>{
 const start=source.indexOf('const packingList=');
 const end=source.indexOf('const allPacking=',start);
 assert.ok(start>=0&&end>start);
 const packingList=source.slice(start,end);
 assert.match(packingList,/bagChecks\.get\(p\.id\)/);
 assert.match(packingList,/bagKey\(p,x,now,day\)/);
});
