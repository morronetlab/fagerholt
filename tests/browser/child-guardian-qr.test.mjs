/** Parent QR tests with a mocked guardian client and server response. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';

let browser,server;
before(async()=>{
 server=await startStaticServer();
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await server?.close();});
const child='00000000-0000-4000-8000-000000000022';
const dialogHTML=String.raw`<dialog id="child-pair-dialog">
 <h2 id="child-pair-title"></h2><p id="child-pair-intro"></p>
 <p id="child-pair-status"></p>
 <div id="child-pair-result" hidden>
 <img id="child-pair-qr"><input id="child-pair-link">
 <button id="child-pair-copy">Kopier</button></div>
 <button id="child-pair-new">Ny kode</button>
 <button id="child-pair-close">Lukk</button>
 <div id="child-pair-devices"></div>
</dialog>`;
async function setup(t,{refuseRefresh=false}={}){
 const context=await browser.newContext();t.after(()=>context.close());
 const page=await context.newPage(),requests=[],errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(server.baseURL+'/barn/index.html',{waitUntil:'load'});
 await page.locator('#child-setup').waitFor({state:'visible'});
 await page.setContent(dialogHTML);
 await page.route('**/api/child-access**',async route=>{
  const data=route.request().postDataJSON?.();
  requests.push({action:data?.action,method:route.request().method(),
   bearer:route.request().headers().authorization});
  if(data?.action==='create'&&requests.filter(x=>x.action==='create').length===1){
   await route.fulfill({status:401,contentType:'application/json',
    body:JSON.stringify({error:'Økten til foresatt har utløpt'})});return;
  }
  const info=data?.action==='create'?{
   link:server.baseURL+'/barn/?pair='+'b'.repeat(64),
   qr:'data:image/svg+xml;base64,'+Buffer.from('<svg/>').toString('base64'),
   expiresAt:'2026-11-01T12:00:00Z'
  }:{devices:[]};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(info)});
 });
 await page.evaluate(async({child,refuseRefresh})=>{
  const fake={session:{access_token:'old-access-token'},
   isSignedIn:()=>true,ensureSession:async()=>{},
   refreshSession:async(force)=>{
    window.__refreshed=(window.__refreshed||0)+1;
    if(!force||refuseRefresh)throw Error('session_not_found');
    fake.session.access_token='new-access-token';
   }};
  const {initChildPairingUI}=await import('/child-pairing-ui.mjs');
  initChildPairingUI({getCloud:()=>({
   client:fake,familyId:'00000000-0000-4000-8000-000000000011'
  })}).open({id:child,name:'Barn A'});
 },{child,refuseRefresh});
 return {page,requests,errors};
}
test('Parent QR retries exactly once with a refreshed session when Auth says 401',async t=>{
 const {page,requests,errors}=await setup(t);
 await page.locator('#child-pair-status').getByText(/Klar!/).waitFor();
 assert.equal(await page.evaluate(()=>window.__refreshed),1);
 assert.deepEqual(requests.filter(x=>x.action==='create').map(x=>x.bearer),[
  'Bearer old-access-token','Bearer new-access-token']);
 assert.equal(await page.locator('#child-pair-result').isVisible(),true);
 assert.deepEqual(errors,[]);
});
test('Revoked parent session displays actionable login instructions, not an obscure generic error',async t=>{
 const {page,requests,errors}=await setup(t,{refuseRefresh:true});
 await page.locator('#child-pair-status').getByText(/logg inn på nytt/i).waitFor();
 assert.equal(requests.filter(x=>x.action==='create').length,1);
 assert.equal(await page.locator('#child-pair-result').isVisible(),false);
 assert.deepEqual(errors,[]);
});
