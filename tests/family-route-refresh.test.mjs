import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('Family route is recovered before fallback plan selection at startup',()=>{
 const boot=app.slice(app.indexOf('function boot(){'));
 const route=boot.indexOf("previousView==='family'");
 const local=boot.indexOf('validSchool(savedSchool');
 assert.ok(route>=0&&local>route,
  'Family route must win over school/plan fallback while cloud auth restores');
 assert.match(boot,/history\.state\?\.\[NAV_KEY\]/);
 assert.match(boot,/sessionStorage\.getItem\(LAST_VIEW_KEY\)/);
 assert.match(boot,/document\.documentElement\.classList\.add\('skoleuka-route-ready'\)/);
});
test('Main view cannot paint welcome or plan while initial route is being restored',()=>{
 assert.match(html,/html:not\(\.skoleuka-route-ready\) #main-content\{visibility:hidden\}/);
 assert.match(app,/sessionStorage\.setItem\(LAST_VIEW_KEY,snapshot\.view\)/);
});
