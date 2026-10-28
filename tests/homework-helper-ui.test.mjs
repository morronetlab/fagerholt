import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('Tutor is linked to homework without removing packing checkboxes',()=>{
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(js,/if\(section==='homework'\)return/);
 assert.match(js,/data-helper-task/);
 assert.match(js,/return \`<label class="checkrow/);
 assert.match(js,/initHomeworkHelper\(\)/);
});
test('Dialog has close button, labelled title and only explanation and hint actions',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 for(const x of ['id="helper-modal"','aria-modal="true"','data-helper-close','data-helper-mode="explain"','data-helper-mode="hint"'])assert.ok(html.includes(x));
 assert.ok(!html.includes('data-helper-mode="practice"'));
});
