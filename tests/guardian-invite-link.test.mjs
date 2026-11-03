import test from 'node:test';
import assert from 'node:assert/strict';
import {
 captureGuardianInvite,clearGuardianInvite,GUARDIAN_INVITE_SESSION_KEY,
 GUARDIAN_INVITE_MAX_AGE_MS
} from '../public/shared/guardian-invite-link.mjs';
function store(){
 const values=new Map();
 return {getItem:key=>values.get(key)||null,
  setItem:(key,v)=>values.set(key,v),
  removeItem:key=>values.delete(key)};
}
const token='a'.repeat(64);
test('Invitation link captures credential in tab-only storage and survives route refresh',()=>{
 const storage=store();
 assert.equal(captureGuardianInvite('#invite='+token,storage,1000),token);
 assert.equal(captureGuardianInvite('',storage,2000),token);
 assert.equal(JSON.parse(storage.getItem(GUARDIAN_INVITE_SESSION_KEY)).token,token);
 clearGuardianInvite(storage);
 assert.equal(captureGuardianInvite('',storage,3000),null);
});
test('Invite is NOT retained beyond 48 hours, malformed hashes replace stale stored tokens',()=>{
 const storage=store();
 captureGuardianInvite('#invite='+token,storage,1000);
 assert.equal(captureGuardianInvite('',storage,1000+GUARDIAN_INVITE_MAX_AGE_MS),null);
 assert.equal(storage.getItem(GUARDIAN_INVITE_SESSION_KEY),null);
 captureGuardianInvite('#invite='+token,storage,1000);
 assert.equal(captureGuardianInvite('#invite=bad',storage,2000),null);
 assert.equal(captureGuardianInvite('',storage,2001),null);
});
test('Malformed, unrelated and uppercase hashes never become an invitation',()=>{
 const storage=store();
 for(const value of ['#invite=not-valid','#invite='+token.toUpperCase(),
  '#invite='+token+'x','#other='+token]){
  assert.equal(captureGuardianInvite(value,storage,100),null);
 }
});
test('Restricted private-mode storage does not crash; invitation still works in memory',()=>{
 const broken={
  getItem(){throw Error('Storage disabled');},
  setItem(){throw Error('Storage disabled');},
  removeItem(){throw Error('Storage disabled');}
 };
 assert.equal(captureGuardianInvite('#invite='+token,broken,100),token);
 assert.equal(captureGuardianInvite('',broken,101),null);
 assert.doesNotThrow(()=>clearGuardianInvite(broken));
});
test('Each browser tab retains only its own invitation',()=>{
 const a=store(),b=store();
 const other='b'.repeat(64);
 assert.equal(captureGuardianInvite('#invite='+token,a,100),token);
 assert.equal(captureGuardianInvite('#invite='+other,b,100),other);
 assert.equal(captureGuardianInvite('',a,200),token);
 assert.equal(captureGuardianInvite('',b,200),other);
});
