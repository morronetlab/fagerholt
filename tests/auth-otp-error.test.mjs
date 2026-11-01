import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudAccount} from '../public/shared/cloud-account.mjs';

const config={url:'https://project-test.supabase.co',publishableKey:'sb_publishable_'+ 'x'.repeat(30)};
const storage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
function clientWith(status,body){
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,body:JSON.parse(options.body||'{}')});
  return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 };
 return {client:new CloudAccount(config,{fetcher,storage}),calls};
}
test('Supabase SMTP 535 becomes actionable Norwegian code-sending error',async()=>{
 const {client,calls}=clientWith(500,{msg:'Error sending magic link email',code:'unexpected_failure'});
 await assert.rejects(client.sendCode('somebody@example.com'),err=>{
  assert.match(err.message,/e-posttjenesten.*SMTP/i);
  assert.doesNotMatch(err.message,/magic link email/i);
  return true;
 });
 assert.equal(calls[0].body.email,'somebody@example.com');
 assert.equal(calls[0].body.create_user,true);
});
test('A successful OTP send keeps existing login/signup flow',async()=>{
 const {client,calls}=clientWith(200,{});
 await client.sendCode('Parent@Example.com');
 assert.equal(calls[0].body.email,'parent@example.com');
});
test('Other Supabase Auth errors retain their specific message',async()=>{
 const {client}=clientWith(429,{msg:'email rate limit exceeded'});
 await assert.rejects(client.sendCode('somebody@example.com'),/email rate limit exceeded/);
});

test('Expired or invalid login code explains how to recover without exposing Supabase jargon',async()=>{
 for(const msg of ['Token has expired or is invalid','otp_expired','Invalid OTP']){
  const {client,calls}=clientWith(403,{msg});
  await assert.rejects(client.verifyCode('parent@example.no','123456'),error=>{
   assert.match(error.message,/Koden er ugyldig eller har utløpt/);
   assert.match(error.message,/Send ny kode/);
   assert.doesNotMatch(error.message,/otp_expired|Token has expired|Invalid OTP/i);
   return true;
  });
  assert.equal(calls[0].body.type,'email');
 }
});
test('OTP rate limit and unexpected errors are handled separately',async()=>{
 const throttled=clientWith(429,{msg:'too many requests'});
 await assert.rejects(throttled.client.verifyCode('parent@example.no','123456'),/For mange forsøk/);
 const unexpected=clientWith(500,{msg:'Provider unavailable'});
 await assert.rejects(unexpected.client.verifyCode('parent@example.no','123456'),/Provider unavailable/);
});
