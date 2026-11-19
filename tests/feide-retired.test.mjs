import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Feide routes, pages and server modules have been removed from the current app',()=>{
 for(const path of ['lib/feide-oidc.mjs','lib/feide-child-link.mjs','lib/feide-child-session.mjs',
  'netlify/functions/feide-oidc.mjs','netlify/functions/feide-child-link.mjs',
  'public/barn/feide/index.html','tests/feide-oidc-server.test.mjs'])
  assert.equal(existsSync(new URL('../'+path,import.meta.url)),false,path);
 assert.doesNotMatch(read('netlify.toml'),/barn\/feide|feide-oidc/i);
});
test('Guardian, pairing and child app retain QR but have no Feide UI',()=>{
 for(const path of ['public/family-ui.mjs','public/child-pairing-ui.mjs',
  'public/barn/child.mjs','public/barn/index.html','public/child-app-setup.css'])
  assert.doesNotMatch(read(path),/feide/i,path);
});
test('Child API uses only device bearer, with no cookie identity fallback',()=>{
 const api=read('lib/child-access.mjs'),entry=read('netlify/functions/child-access.mjs');
 assert.doesNotMatch(api,/feide|activeChildContext/i);
 assert.doesNotMatch(entry,/feide|feideRuntimeEnv/i);
 assert.match(api,/await childDeviceContext\(request,fetchImpl,env,now\)/);
 assert.match(entry,/createChildAccessHandler\(\)/);
});
test('Existing child group personalization and QR installation are preserved',()=>{
 const child=read('public/barn/child.mjs'),family=read('public/family-ui.mjs');
 assert.match(child,/vocabularyForProfile/);
 assert.match(family,/childSetupMarkup\(p\)/);
 assert.match(child,/action:'redeem'/);
 assert.match(child,/action:'restore-install'/);
});
