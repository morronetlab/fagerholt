import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const family=source('public/family-ui.mjs');
const parent=source('public/barn/feide/foresatt/guardian.mjs');
const html=source('public/barn/feide/foresatt/index.html');
const childPair=source('public/child-pairing-ui.mjs');
const css=source('public/child-app-setup.css');

test('Every authenticated family child exposes a direct Feide linking action when server enables Feide',()=>{
 assert.match(family,/function feideCardMarkup\(p\)/);
 assert.match(family,/if\(!cloud\?\.familyId\|\|!feideReady\)return ''/);
 assert.match(family,/feideCardMarkup\(p\)\+/);
 assert.match(family,/href="\/barn\/feide\/foresatt\/\?childId='/);
 assert.match(family,/encodeURIComponent\(p\.id\)/);
 assert.match(family,/Feide-innlogging/);
 assert.match(family,/Koble til Feide/);
 assert.match(family,/Administrer Feide/);
 assert.match(family,/feideLinks\.get\(p\.id\)/);
});
test('Feide availability and child link status are read securely and never invent a linked account',()=>{
 assert.match(family,/fetch\('\/api\/feide-oidc\/status'/);
 assert.match(family,/feideReady=status\?\.ready===true/);
 assert.match(family,/await current\.client\.ensureSession\(\)/);
 assert.match(family,/Authorization:'Bearer '\+current\.client\.session\.access_token/);
 assert.match(family,/fetch\('\/api\/feide-child-link\?action=status&childId='/);
 assert.match(family,/if\(!res\.ok\)return \[p\.id,null\]/);
 assert.match(family,/feideLinks=new Map\(results\)/);
 assert.match(family,/sequence!==feideCheckVersion\|\|cloud!==current/);
 assert.match(family,/cloud=null;feideCheckVersion\+\+;feideReady=false;feideLinks\.clear\(\)/);
});
test('Guardian page preselects only a child present in the RLS-visible family results',()=>{
 assert.match(parent,/requestedChildId=new URL\(location\.href\)\.searchParams\.get\('childId'\)/);
 assert.match(parent,/cloud\.rows\('children'/);
 assert.match(parent,/children\.some\(child=>child\.id===requestedChildId\)/);
 assert.match(parent,/\$\('child'\)\.value=requestedChildId/);
 assert.match(parent,/\$\('child'\)\.dispatchEvent\(new Event\('change'\)\)/);
 assert.match(parent,/await api\('approve'/);
 assert.match(parent,/await api\('revoke'/);
 assert.match(html,/Koble Feide til barnet/);
 assert.doesNotMatch(html,/Denne siden skal ikke brukes med ekte elevkontoer|Databaseendringene skal først prøves|i denne Deploy Preview/);
 assert.doesNotMatch(html,/<title>[^<]*\(test\)/);
});
test('QR pairing remains independent and also opens Feide with the selected child',()=>{
 assert.match(childPair,/child-pair-feide-link/);
 assert.match(childPair,/child\?\.id\?'\?childId='/);
 assert.match(childPair,/encodeURIComponent\(child\.id\)/);
 assert.match(childPair,/child-pair-new/);
 assert.match(childPair,/child-pair-qr/);
});
test('Feide action is not hidden by mobile More actions',()=>{
 assert.match(css,/#family-view \.family-child-feide\{/);
 assert.match(css,/#family-view \.family-child-feide-link\{/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.doesNotMatch(css,/\.family-child-feide\{display:none/);
});
