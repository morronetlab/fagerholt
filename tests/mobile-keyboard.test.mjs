import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {keyboardViewport,KEYBOARD_THRESHOLD_PX} from '../public/mobile-keyboard.mjs';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Detects keyboard with a focused field, not browser chrome or unfocused resize',()=>{
 assert.equal(keyboardViewport({baseline:800,visibleHeight:780,focused:true}).open,false);
 assert.equal(keyboardViewport({baseline:800,visibleHeight:800-KEYBOARD_THRESHOLD_PX+1,focused:true}).open,false);
 const result=keyboardViewport({baseline:800,visibleHeight:430,offsetTop:20,focused:true});
 assert.deepEqual(result,{open:true,height:430,top:20,occluded:350});
 assert.equal(keyboardViewport({baseline:800,visibleHeight:430,focused:false}).open,false);
});
test('Mobile keyboard support is wired into parent and child entrypoints',()=>{
 for(const path of ['public/index.html','public/barn/index.html']){
  const html=file(path);
  assert.match(html,/href="\/mobile-keyboard\.css"/);
  assert.match(html,/src="\/mobile-keyboard\.mjs"/);
 }
 const styles=file('public/mobile-keyboard.css');
 assert.match(styles,/data-mobile-keyboard="open"/);
 assert.match(styles,/font-size:16px/);
 assert.match(styles,/onboard-actions/);
 assert.match(styles,/family-child-dialog/);
 assert.match(file('public/family-child-dialog.css'),/dialog\.family-child-dialog/);
 assert.match(file('public/index.html'),/id="family-child-dialog"/);
 const js=file('public/mobile-keyboard.mjs');
 assert.match(js,/viewport\.addEventListener\('resize',update\)/);
 assert.match(js,/dialog\.scrollTop\+=delta/);
 assert.match(js,/win\.scrollBy/);
});
