import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {childSetupInfo} from '../public/shared/child-setup-state.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Parent status tells apart QR ready, QR scanned, installed and unknown',()=>{
 const notInvited=childSetupInfo('not_invited');
 const invited=childSetupInfo('invited');
 const scanned=childSetupInfo('activated');
 const installed=childSetupInfo('installed');
 const unknown=childSetupInfo('unknown');
 const checking=childSetupInfo('checking');
 assert.equal(checking.status,'checking');
 assert.match(checking.label,/Sjekker appstatus/);
 assert.equal(checking.action,null,'Never offer a new QR while the current status is being checked');
 assert.equal(checking.complete,false);
 assert.deepEqual([notInvited.step,invited.step,scanned.step,installed.step],[0,1,2,3]);
 assert.deepEqual([notInvited.complete,invited.complete,scanned.complete,installed.complete],
  [false,false,false,true]);
 assert.match(invited.label,/QR-kode klar/);
 assert.match(scanned.label,/QR-kode skannet/);
 assert.match(scanned.action,/Fullfør installasjon/);
 assert.match(scanned.description,/hjemskjermen/);
 assert.equal(installed.label,'App installert');
 assert.equal(installed.action,null);
 assert.equal(unknown.status,'unknown');
 assert.match(unknown.label,/ikke tilgjengelig/);
 assert.match(unknown.action,/hjelp/i);
 assert.notEqual(unknown.status,'not_invited','Network outage must not imply the device was removed');
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
