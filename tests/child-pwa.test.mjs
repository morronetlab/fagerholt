import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {childIconPng} from '../scripts/generate-child-icons.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Child PWA manifest is installable and limited to dedicated /barn scope',()=>{
 const m=JSON.parse(read('public/barn/manifest.webmanifest'));
 assert.equal(m.start_url,'/barn/');
 assert.equal(m.scope,'/barn/');
 assert.equal(m.display,'standalone');
 assert.equal(m.icons.length,2);
 assert.ok(m.icons.some(x=>x.sizes==='192x192'&&x.type==='image/png'));
 assert.ok(m.icons.some(x=>x.sizes==='512x512'&&x.type==='image/png'));
});
test('Home-screen icons are valid deterministic PNGs at both required sizes',()=>{
 for(const size of [192,512]){
  const png=childIconPng(size);
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),size);
  assert.equal(png.readUInt32BE(20),size);
  assert.ok(png.length>150);
  assert.deepEqual(png,childIconPng(size));
 }
});
test('Child service worker never caches private API, pairing URLs or session data',()=>{
 const sw=read('public/barn/sw.js');
 assert.match(sw,/url\.pathname\.startsWith\('\/api\/'\)/);
 assert.match(sw,/url\.search/);
 assert.match(sw,/event\.request\.method!=='GET'/);
 assert.match(sw,/url\.origin!==self\.location\.origin/);
 assert.doesNotMatch(sw,/cache\.put\([^)]*child-access/);
 assert.doesNotMatch(sw,/SESSION_KEY|Authorization|SUPABASE_SERVICE_ROLE/);
});
test('Child shell is separated from account, family and guardian administrative tools',()=>{
 const child=read('public/barn/index.html');
 const js=read('public/barn/child.mjs');
 assert.doesNotMatch(child,/id="account-panel"|id="family-view"|data-family-remove/);
 assert.doesNotMatch(js,/SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
 assert.match(js,/history\.replaceState\(null,'','\/barn\/'\)/);
 assert.match(js,/localStorage\.setItem\(KEY,token\)/);
 assert.match(js,/groupApplies/);
});
test('Saved family plan hides school and grade switches while guest selection stays intact',()=>{
 const app=read('public/app.js'),html=read('public/index.html');
 assert.match(app,/for\(const id of \['change-school','change-grade','mobile-selection-menu'\]\)/);
 assert.match(app,/Boolean\(selectedProfile\)/);
 assert.match(app,/familyUI\.activitiesForProfile/);
 assert.match(html,/id="plan-day-activities"/);
 assert.match(html,/id="landing-create-family"/);
 assert.match(html,/href="\/barn\/"/);
});
