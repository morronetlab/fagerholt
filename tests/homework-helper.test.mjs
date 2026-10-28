import test from 'node:test';
import assert from 'node:assert/strict';
import {createHomeworkHelperHandler,validHomeworkRequest} from '../netlify/functions/homework-helper.mjs';
const valid={text:'Les en tekst om dyr og beskriv hovedinnholdet',subject:'Norsk',grade:'3',mode:'hint'};
test('Reject invalid or excessive payloads',()=>{assert.ok(validHomeworkRequest(valid));assert.equal(validHomeworkRequest({...valid,grade:'9'}),false);assert.equal(validHomeworkRequest({...valid,text:'x'.repeat(701)}),false);});
test('No secret configured: returns 503, not a fabricated explanation',async()=>{
 const req=new Request('https://example.org/api/homework-helper',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(valid)});
 const res=await createHomeworkHelperHandler({env:{}})(req);assert.equal(res.status,503);
});
test('Returns sourced model response without exposing keys to browser',async()=>{
 const store={get:async()=>null,set:async()=>{}};
 const fetchImpl=async(url,options)=>{
  assert.match(url,/api.openai.com/);
  const data=JSON.parse(options.body);assert.equal(data.store,false);
  assert.match(data.input[0].content[0].text,/uten å levere ferdig/);
  return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:'Begynn med å lese første avsnitt.'}]}]}),{status:200});
 };
 const req=new Request('https://example.org/api/homework-helper',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(valid)});
 const res=await createHomeworkHelperHandler({fetchImpl,env:{OPENAI_API_KEY:'testing'},storeFactory:()=>store})(req);
 assert.equal(res.status,200);assert.deepEqual(await res.json(),{help:'Begynn med å lese første avsnitt.'});
});
