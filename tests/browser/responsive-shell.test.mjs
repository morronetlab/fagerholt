/** Cross-engine responsive smoke without private family data. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {startStaticServer} from './static-server.mjs';

const engineName=process.env.QA_BROWSER||'chromium';
const engine={chromium,firefox,webkit}[engineName];
if(!engine)throw Error('Unknown QA_BROWSER: '+engineName);
let browser,server;
before(async()=>{
 server=await startStaticServer();
 browser=await engine.launch({headless:true});
});
after(async()=>{await browser?.close();await server?.close();});

for(const width of [320,390,768,1024,1440]){
 test('Unpaired child setup stays usable at '+width+'px ('+engineName+')',async()=>{
  const context=await browser.newContext({viewport:{width,height:850},locale:'nb-NO',timezoneId:'Europe/Oslo'});
  try{
   const page=await context.newPage();
   const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(server.baseURL+'/barn/',{waitUntil:'domcontentloaded'});
   await page.locator('#child-setup').waitFor({state:'visible'});
   assert.equal(await page.locator('#child-ready').isVisible(),false);
   assert.equal(await page.locator('#child-retry').isVisible(),true);
   const layout=await page.evaluate(()=>({
    viewport:document.documentElement.clientWidth,
    body:document.body.scrollWidth,
    main:document.querySelector('#child-app').getBoundingClientRect().toJSON(),
    retry:document.querySelector('#child-retry').getBoundingClientRect().toJSON()
   }));
   assert.ok(layout.body<=layout.viewport+2,
    'Unexpected horizontal overflow: '+JSON.stringify(layout));
   assert.ok(layout.retry.left>=-1&&layout.retry.right<=layout.viewport+1,
    'Retry action must be within viewport: '+JSON.stringify(layout));
   assert.deepEqual(errors,[]);
  }finally{await context.close();}
 });
}
