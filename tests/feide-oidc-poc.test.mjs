import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PROVIDER,CALLBACK_PATH,PENDING_KEY,isPreviewHost,previewCallback,
  feideAuthorizeURL,parseOAuthCallback,identitySummary}
  from '../public/barn/feide/poc-core.mjs';

const origin='https://deploy-preview-169--ukeplanen.netlify.app/';
const supabase='https://qxejliyfgfeigvxsqupg.supabase.co';

test('Feide POC runs only on genuine Skoleuka Netlify PR previews',()=>{
 assert.equal(isPreviewHost('deploy-preview-169--ukeplanen.netlify.app'),true);
 for(const hostname of ['www.skoleuka.no','ukeplanen.netlify.app',
  'deploy-preview-0--ukeplanen.netlify.app',
  'deploy-preview-169--evil.netlify.app',
  'deploy-preview-169--ukeplanen.netlify.app.attacker.org','localhost'])
  assert.equal(isPreviewHost(hostname),false,hostname);
 assert.equal(previewCallback(origin),origin.slice(0,-1)+CALLBACK_PATH);
 assert.throws(()=>previewCallback('https://www.skoleuka.no'));
 assert.throws(()=>previewCallback('http://deploy-preview-169--ukeplanen.netlify.app'));
});
test('Supabase authorize URL is scoped to Feide and allowlisted preview callback',()=>{
 const url=new URL(feideAuthorizeURL(supabase,origin));
 assert.equal(url.origin,supabase);
 assert.equal(url.pathname,'/auth/v1/authorize');
 assert.equal(url.searchParams.get('provider'),PROVIDER);
 assert.equal(url.searchParams.get('redirect_to'),previewCallback(origin));
 assert.equal([...url.searchParams].length,2);
 assert.throws(()=>feideAuthorizeURL('https://evil.example',origin));
 assert.throws(()=>feideAuthorizeURL('http://qxejliyfgfeigvxsqupg.supabase.co',origin));
});
test('Callback parses without returning provider or refresh secrets',()=>{
 const input='#access_token=SUPABASE_ACCESS&refresh_token=DO_NOT_STORE&provider_token=DO_NOT_STORE_EITHER&token_type=bearer&expires_in=3600';
 const p=parseOAuthCallback(input,'');
 assert.deepEqual(p,{kind:'access-token',accessToken:'SUPABASE_ACCESS',rawIdTokenReturned:false});
 assert.equal(JSON.stringify(p).includes('DO_NOT_STORE'),false);
 assert.equal(parseOAuthCallback('#error=access_denied&error_description=private','').kind,'error');
 assert.equal(parseOAuthCallback('','?code=xxx').kind,'unsupported-code');
 assert.equal(parseOAuthCallback('#access_token=x&token_type=notbearer','').kind,'missing');
 assert.equal(parseOAuthCallback('#access_token=x&token_type=bearer&id_token=raw','').rawIdTokenReturned,true);
});
test('Identity only matches custom Feide provider; linked parental identities are flagged',()=>{
 assert.deepEqual(identitySummary(null),{feide:false,stableSubject:false,otherIdentities:false});
 assert.deepEqual(identitySummary({identities:[{provider:'email'}]}),
  {feide:false,stableSubject:false,otherIdentities:true});
 const feide={identities:[{provider:PROVIDER,identity_data:{sub:'test-opaque-sub'}}]};
 assert.deepEqual(identitySummary(feide),{feide:true,stableSubject:true,otherIdentities:false});
 assert.deepEqual(identitySummary({identities:[...feide.identities[0]?[feide.identities[0]]:[],{provider:'email'}]}),
  {feide:true,stableSubject:true,otherIdentities:true});
});
test('No family access, persistent credentials, or unsanctioned Feide SLO in test UI',()=>{
 const src=readFileSync(new URL('../public/barn/feide/poc.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/barn/feide/index.html',import.meta.url),'utf8');
 const netlify=readFileSync(new URL('../netlify.toml',import.meta.url),'utf8');
 assert.match(src,/window\.history\.replaceState/);
 assert.match(src,/\/auth\/v1\/logout\?scope=local/);
 assert.match(src,/\/auth\/v1\/user/);
 assert.doesNotMatch(src,/localStorage|\/rest\/v1\/|\/api\/child-access|endsession/);
 assert.match(src,/isPreviewHost\(window\.location\.hostname\)/);
 assert.match(src,/sessionStorage\.setItem\(PENDING_KEY/);
 assert.match(src,/sessionStorage\.removeItem\(PENDING_KEY\)/);
 assert.match(html,/Full logout|Feides RP-Initiated Logout|Feides RP-Initiated Logout krever/);
 assert.match(netlify,/from = "\/barn\/feide\/callback"\s+to = "\/barn\/feide\/index.html"/);
 assert.match(netlify,/for = "\/barn\/feide\/\*"/);
 assert.equal(PENDING_KEY.startsWith('skoleuka.feide.poc'),true);
});
