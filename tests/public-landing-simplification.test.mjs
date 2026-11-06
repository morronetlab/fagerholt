import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('public/index.html');
const jsApp=read('public/app.js');
const css=read('public/landing-first-time.css');
const welcome=html.slice(html.indexOf('<section id="welcome-view"'),html.indexOf('<section id="family-view"'));
test('Landing offers exactly two primary destinations, with child app as guidance',()=>{
 assert.ok(welcome.length>0);
 assert.equal((welcome.match(/<article class="welcome-choice /g)||[]).length,2);
 assert.match(welcome,/id="landing-create-family"[^>]+>Kom i gang/);
 assert.match(welcome,/id="landing-open-plan"[^>]+>Velg skole/);
 assert.match(welcome,/Skal barnet bruke Skoleuka/);
 assert.match(welcome,/inviterer barnet med QR-kode/);
 assert.match(welcome,/class="welcome-child-link[^"]*" href="\/barn\/"/);
 assert.ok(!welcome.includes('welcome-child-choice'),'Child app is not a third registration path');
 assert.ok(!welcome.includes('welcome-points'),'No duplicate feature badges');
});
test('Local family is a disclosed secondary choice with clear device-only warning',()=>{
 const disclosure=welcome.indexOf('id="landing-other-options"');
 const local=welcome.indexOf('id="landing-local-family"');
 assert.ok(disclosure>=0&&local>disclosure);
 assert.match(welcome,/aria-controls="welcome-alternatives-panel" aria-expanded="false"/);
 assert.match(welcome,/lagres bare på denne enheten og synkroniseres ikke med andre/);
 assert.match(css,/#welcome-view\.show-welcome-options \.welcome-alternatives-panel/);
 assert.match(css,/#welcome-view \.welcome-alternatives-panel\{\s*display:none/);
});
test('Global tabs are hidden and inert throughout the app, keeping contextual navigation',()=>{
 assert.match(jsApp,/document\.body\.classList\.toggle\('public-landing-active',welcome\)/);
 assert.match(jsApp,/primaryNav\.hidden=true/);
 assert.match(jsApp,/primaryNav\.inert=true/);
 const cleanup=read('public/navigation-compact.css');
 assert.match(cleanup,/html \.primary-nav \{ display:none!important; \}/);
 assert.match(cleanup,/@media\(max-width:700px\)/);
 assert.match(html,/href="\/navigation-compact\.css"/);
 assert.ok(html.indexOf('href="/navigation-compact.css"')>html.indexOf('href="/landing-first-time.css"'),
  'Main navigation cleanup must be loaded last');
 assert.match(css,/#welcome-view\.show-welcome-options/);
});
test('All original action ids and QR/back-end integrations remain intact',()=>{
 for(const id of ['nav-home','nav-plan','family-toggle','account-button',
  'landing-create-family','landing-open-plan','landing-other-options','landing-local-family',
  'welcome-week-number','account-request-form','account-verify-form']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 for(const binding of ["$('landing-create-family').addEventListener",
  "$('landing-open-plan').addEventListener","$('landing-local-family').addEventListener",
  "$('landing-other-options').addEventListener"]){
  assert.ok(jsApp.includes(binding),binding);
 }
});
