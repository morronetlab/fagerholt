import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {childSetupInfo} from '../public/shared/child-setup-state.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('QR activation never counts as installation and keeps a visible setup CTA',()=>{
 for(const status of ['unknown','not_invited','invited','activated']){
  const info=childSetupInfo(status);
  assert.equal(info.complete,false);
  assert.match(info.action,/QR/);
  assert.ok(info.description.length>15);
 }
 const activated=childSetupInfo('activated');
 assert.match(activated.description,/hjemskjermen/);
 const installed=childSetupInfo('installed');
 assert.equal(installed.complete,true);
 assert.equal(installed.action,null);
 assert.match(installed.label,/klar/);
});

test('The guardian child plan hides generic navigation only for signed-in child profiles',()=>{
 const app=read('public/app.js'),css=read('public/child-app-setup.css');
 assert.match(app,/family-child-plan-active/);
 assert.match(app,/familyUI\?\.isCloudProfile\(state\.profileId\)/);
 assert.match(css,/body\.family-child-plan-active \.primary-nav\{display:none!important\}/);
 assert.match(app,/plan-back-family/);
 assert.match(app,/plan-child-app-qr/);
});
test('The child only reports app installation from standalone mode or appinstalled',()=>{
 const child=read('public/barn/child.mjs');
 assert.match(child,/fromInstallEvent&&!isPresent\(\)/);
 assert.match(child,/action:'mark-installed'/);
 assert.match(child,/addEventListener\('appinstalled'/);
 assert.match(child,/void reportInstalled\(\)/);
});
