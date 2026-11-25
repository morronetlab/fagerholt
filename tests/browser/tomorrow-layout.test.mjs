import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const name=process.env.QA_BROWSER||'chromium';
const engine={chromium,firefox,webkit}[name];
if(!engine)throw Error('Unsupported QA_BROWSER: '+name);
let browser,server;
before(async()=>{server=await startStaticServer();browser=await engine.launch({headless:true});});
after(async()=>{await browser?.close();await server?.close();});
for(const width of [320,390,768]){
 test('Tomorrow briefing precedes weekly notices at '+width+'px in '+name,async()=>{
  const context=await browser.newContext({viewport:{width,height:800},serviceWorkers:'block'});
  try{
   const page=await context.newPage();
   await page.goto(server.baseURL+'/',{waitUntil:'domcontentloaded'});
   const result=await page.evaluate(()=>{
    const root=document.getElementById('family-view');
    const tomorrow=document.getElementById('family-tomorrow-brief');
    const notices=root.querySelector('.family-tomorrow.family-important');
    const actions=[...tomorrow.querySelectorAll('.family-tomorrow-brief-actions button')];
    return {
     order: Boolean(tomorrow.compareDocumentPosition(notices)&Node.DOCUMENT_POSITION_FOLLOWING),
     sameParent:tomorrow.parentElement===notices.parentElement,
     controls:actions.map(el=>({
      minHeight:getComputedStyle(el).minHeight
     }))
    };
   });
   assert.equal(result.sameParent,true);
   assert.equal(result.order,true,'Tomorrow briefing must appear first');
   if(width<=700)for(const control of result.controls)
    assert.ok(parseFloat(control.minHeight)>=44,'Tomorrow action minimum below 44px');
  }finally{await context.close();}
 });
}
