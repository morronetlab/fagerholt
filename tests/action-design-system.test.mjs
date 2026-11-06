import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const roles=new Set(['navigate','modal','disclosure','utility','submit','danger','link','close','choice','card']);
const controls=content=>[...content.matchAll(/<(?:button|summary)\b[^>]*>/g)].map(m=>m[0]);
const checkRoles=(content,path)=>{
 const elements=controls(content);
 assert.ok(elements.length>0,'No controls found in '+path);
 for(const tag of elements){
  const matches=[...tag.matchAll(/sk-action--([a-z]+)/g)].map(x=>x[1]);
  assert.equal(matches.length,1,path+': exactly one semantic role required in '+tag.slice(0,180));
  assert.ok(tag.includes('sk-action '),path+': missing base class in '+tag.slice(0,180));
  assert.ok(roles.has(matches[0]),path+': unknown role '+matches[0]);
  if(tag.startsWith('<summary')&&!tag.includes('Flere kalendervalg'))
   assert.equal(matches[0],'disclosure',path+': summary must expand/collapse');
 }
};
test('The canonical action CSS loads LAST on main, child and operations routes',()=>{
 for(const path of ['public/index.html','public/barn/index.html','public/drift/index.html']){
  const html=source(path),links=[...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(m=>m[0]);
  assert.ok(links.length>=2,path);
  assert.match(links.at(-1),/href="\/action-system\.css"/,path);
  checkRoles(html,path);
 }
});
test('Main app and dynamic family, activity, agenda and child renderers classify every generated button',()=>{
 for(const path of [
  'public/family-ui.mjs','public/family-activities-ui.mjs',
  'public/shared/family-week-agenda-html.mjs','public/app.js',
  'public/barn/child.mjs','public/barn/child-quiz.mjs',
  'public/child-pairing-ui.mjs'
 ])checkRoles(source(path),path);
 assert.match(source('public/shared/word-quiz.mjs'),/button\.classList\.add\('sk-action','sk-action--choice'\)/);
 assert.match(source('public/drift/drift.mjs'),/label\.classList\.add\('sk-action','sk-action--disclosure'\)/);
});
test('Actions that open different dialogs share the modal role, navigation is distinct',()=>{
 const html=source('public/index.html');
 for(const id of ['account-button','landing-create-family','family-add',
  'family-empty-add','family-activity-add','plan-child-app-qr','report-plan-issue']){
  const button=controls(html).find(c=>c.includes('id="'+id+'"'));
  assert.ok(button?.includes('sk-action--modal'),id+' should be modal, not a primary navigation button');
 }
 for(const id of ['account-open-family','landing-open-plan','plan-back-family']){
  const button=controls(html).find(c=>c.includes('id="'+id+'"'));
  assert.ok(button?.includes('sk-action--navigate'),id+' should look like navigation');
 }
 const family=source('public/family-ui.mjs');
 assert.match(family,/sk-action--navigate[^>]*data-family-open/);
 assert.match(family,/sk-action--modal[^>]*data-family-pair/);
 assert.match(family,/sk-action--modal[^>]*data-family-edit/);
 assert.match(family,/sk-action--danger[^>]*data-family-remove/);
 assert.match(family,/sk-action--disclosure[^>]*data-family-more/);
});
test('Expandable controls have one semantic disclosure role and keep live aria-expanded state',()=>{
 const html=source('public/index.html');
 for(const id of ['family-mobile-important-more','family-tomorrow-brief-more',
  'family-agenda-weekend-toggle','weather-toggle','landing-other-options']){
  const button=controls(html).find(c=>c.includes('id="'+id+'"'));
  assert.ok(button?.includes('sk-action--disclosure'),id);
  assert.match(button,/aria-expanded/);
 }
 for(const id of ['weather-toggle','landing-other-options']){
  const tag=controls(html).find(c=>c.includes('id="'+id+'"'));
  assert.ok(!tag.includes('data-sk-chevron="off"'),id+' now uses the shared CSS chevron');
 }
 const admin=controls(html).find(c=>c.includes('id="family-mobile-admin-toggle"'));
 assert.ok(admin.includes('data-sk-chevron="off"'),'Icon-only settings action keeps its own gear, never a second arrow');
 assert.match(source('public/shared/family-week-agenda-html.mjs'),/sk-action--disclosure[^>]*data-family-agenda-details/);
});
test('Centralized hover, keyboard focus, disabled and reduced-motion states are present',()=>{
 const css=source('public/action-system.css');
 for(const role of roles)assert.ok(css.includes('.sk-action--'+role),role);
 for(const rule of ['focus-visible','prefers-reduced-motion','[aria-expanded="true"]','[disabled]','--sk-action-radius','--sk-action-focus']){
  assert.ok(css.includes(rule),rule);
 }
 assert.ok(!/\.sk-action[^{}]*\{[^{}]*display\s*:\s*none/mi.test(css),'Do not alter layout/visibility');
});


test('Disclosure arrows are CSS-only; old glyphs and markers cannot stack',()=>{
 const html=source('public/index.html');
 const family=source('public/family-v3.css');
 const controlsToCheck=['landing-other-options','weather-toggle','notices-panel','goals-panel'];
 for(const id of controlsToCheck){
  const i=html.indexOf('id="'+id+'"');
  assert.ok(i>=0,id);
  const nearby=html.slice(i,i+450);
  assert.ok(!nearby.includes('class="chevron"'),id+' should not keep a duplicate inline chevron');
  if(['weather-toggle','landing-other-options'].includes(id))
   assert.ok(!nearby.includes('aria-hidden="true">⌄</span>'),id+' should not keep a Unicode arrow');
 }
 assert.ok(!/::after\s*\{\s*content:\s*['"](?:⌄|⌃| ⌄| ⌃)/.test(family),
  'Legacy family summary arrows must not render Unicode glyphs');
 const css=source('public/action-system.css');
 assert.match(css,/details\[open\] > summary\.sk-action--disclosure/);
 assert.match(css,/border-right:2px solid currentColor/);
 assert.match(css,/border-bottom:2px solid currentColor/);
 assert.match(css,/transform:rotate\(225deg\)/);
 assert.match(css,/#family-tomorrow-brief-more\.sk-action--disclosure/);
 assert.match(css,/#family-reminders-more|\.family-reminders-more\.sk-action--disclosure/);
});
