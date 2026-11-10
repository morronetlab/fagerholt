import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {expandHomework} from '../public/shared/homework-view.mjs';
import {homeworkDisplayGroups} from '../public/shared/homework-card-groups.mjs';

const weekdays=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
test('Five daily reading checkboxes render as one card but keep original storage indices',()=>{
 const expanded=expandHomework([{text:'Les 15 minutter hver dag',subject:'Norsk',repeatDays:weekdays},{text:'Engelsk',subject:'Engelsk'}]);
 const groups=homeworkDisplayGroups(expanded);
 assert.equal(groups.length,2);
 assert.equal(groups[0].kind,'daily');
 assert.deepEqual(groups[0].entries.map(x=>x.index),[0,1,2,3,4]);
 assert.equal(groups[1].index,5);
});
test('Different groups, deadlines or incomplete weekdays are never merged',()=>{
 const expanded=expandHomework([{text:'Les',repeatDays:weekdays,group:'Rød gruppe'}]);
 expanded[2]={...expanded[2],group:'Blå gruppe'};
 assert.equal(homeworkDisplayGroups(expanded).every(g=>g.kind==='single'),true);
 assert.equal(homeworkDisplayGroups([{text:'Les',repeatDay:'Mandag',repeatDays:weekdays}])[0].kind,'single');
});
test('Homework UI retains indexed helper and checkboxes; packing remains a separate path',()=>{
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(js,/homeworkDisplayGroups\(items\)/);
 assert.match(js,/data-helper-task/);
 assert.match(js,/data-check="homework"/);
 assert.match(js,/data-index="\$\{entry.index\}"/);
 assert.match(js,/if\(section==='homework'\)return/);
 assert.match(js,/return \`<label class="checkrow/);
 assert.match(html,/homework-studio-compact\.css/);
});
