import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {skoleukaIconPng,childIconPng} from '../scripts/generate-child-icons.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const bytes=path=>readFileSync(new URL('../'+path,import.meta.url));

test('Skoleuka has one book/planner identity on the public site and child app',()=>{
 const parent=read('public/index.html'),child=read('public/barn/index.html');
 const logo=read('public/brand/skoleuka-icon.svg');
 assert.match(logo,/<svg\s/);
 assert.match(logo,/<path/);
 assert.match(logo,/<circle/);
 assert.match(logo,/#1D5C4B/);
 assert.equal(read('public/barn/icon.svg'),logo,'Legacy child favicon must match canonical logo');
 assert.match(parent,/class="brand-icon" src="\/brand\/skoleuka-icon.svg"/);
 assert.match(child,/class="child-brand-icon" src="\/brand\/skoleuka-icon.svg"/);
 assert.match(parent,/rel="icon" type="image\/svg\+xml" href="\/brand\/skoleuka-icon.svg"/);
 assert.match(child,/rel="icon" type="image\/svg\+xml" href="\/brand\/skoleuka-icon.svg"/);
 assert.match(parent,/href="\/brand\/skoleuka-brand.css"/);
 assert.match(child,/href="\/brand\/skoleuka-brand.css"/);
 assert.doesNotMatch(parent,/class="brand-symbol"/,'Do not duplicate inline logo geometry in the main header');
});

test('Guardian and child PWA manifests have separate scopes and identical app icons',()=>{
 const guardian=JSON.parse(read('public/manifest.webmanifest'));
 const child=JSON.parse(read('public/barn/manifest.webmanifest'));
 assert.equal(guardian.scope,'/');
 assert.equal(guardian.start_url,'/');
 assert.equal(child.scope,'/barn/');
 assert.equal(child.start_url,'/barn/');
 assert.equal(guardian.display,'standalone');
 assert.equal(child.display,'standalone');
 assert.equal(guardian.theme_color,child.theme_color);
 assert.deepEqual(guardian.icons,child.icons);
 assert.deepEqual(guardian.icons.map(x=>x.sizes),['192x192','512x512']);
 for(const icon of guardian.icons){
  assert.equal(icon.purpose,'any maskable');
  assert.match(icon.src,/^\/brand\/skoleuka-(192|512)\.png$/);
 }
 assert.match(read('public/index.html'),/rel="manifest" href="\/manifest.webmanifest"/);
 assert.match(read('public/barn/index.html'),/rel="manifest" href="\/barn\/manifest.webmanifest"/);
});

test('New PNG icons are deterministic, published during npm pretest and byte-identical across apps',()=>{
 for(const n of [192,512]){
  const icon=skoleukaIconPng(n);
  assert.deepEqual(icon,childIconPng(n));
  assert.equal(icon.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(icon.readUInt32BE(16),n);
  assert.equal(icon.readUInt32BE(20),n);
  assert.ok(icon.length>300);
  assert.deepEqual(bytes('public/brand/skoleuka-'+n+'.png'),icon);
  assert.deepEqual(bytes('public/barn/icon-'+n+'.png'),icon);
 }
});

test('Offline child shell caches common brand assets without caching private data',()=>{
 const sw=read('public/barn/sw.js');
 assert.match(sw,/skoleuka-child-shell-v6/);
 for(const path of ['/brand/skoleuka-icon.svg','/brand/skoleuka-brand.css',
  '/brand/skoleuka-192.png','/brand/skoleuka-512.png']){
  assert.ok(sw.includes("'"+path+"'"),'Missing offline asset '+path);
 }
 assert.match(sw,/url\.pathname\.startsWith\('\/api\/'\)/);
 assert.doesNotMatch(sw,/SESSION_KEY|Authorization|SUPABASE_SERVICE_ROLE/);
});

test('Family tabs use consistent outline icons and accessible labels, not emoji',()=>{
 const html=read('public/index.html');
 for(const tab of ['overview','calendar','activities']){
  assert.match(html,new RegExp('data-family-mobile-tab="'+tab+'".*class="family-nav-icon"'));
 }
 assert.doesNotMatch(html,/data-family-mobile-tab="(?:overview|calendar|activities)"[^>]*>[🏠📅⚽]/u);
});
