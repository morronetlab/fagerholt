import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const engineName=process.env.QA_BROWSER||'chromium';
const engine={chromium,firefox,webkit}[engineName];
if(!engine)throw Error('Unsupported engine '+engineName);
let browser,server;
before(async()=>{server=await startStaticServer();browser=await engine.launch({headless:true});});
after(async()=>{await browser?.close();await server?.close();});
for(const width of [320,390,700]){
 test('Activity modal actions and child choices fit '+width+'px in '+engineName,async()=>{
  const context=await browser.newContext({viewport:{width,height:780},serviceWorkers:'block'});
  try{
   const page=await context.newPage();
   await page.goto(server.baseURL+'/barn/',{waitUntil:'domcontentloaded'});
   await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/family-activity-dialog.css"><link rel="stylesheet" href="/mobile-keyboard.css"></head><body>
    <dialog id="family-activity-dialog" class="family-activity-dialog"><form id="family-activity-form">
     <div class="family-form-head"><h3>Legg til aktivitet</h3><button class="family-form-close" type="button">Lukk</button></div>
     <div class="family-activity-fields"><label>Tittel<input type="text"></label>
      <label class="family-activity-child-field">Hvem gjelder det?<select><option>Hele familien</option></select></label>
      <div class="family-activity-child-choices" role="group">
       <button type="button" aria-pressed="true">Hele familien</button><button type="button">Barn A</button>
      </div>
      <label>Dato<input type="date"></label>
      <label>Starttid<input type="time"></label>
      <label>Sted<input type="text"></label>
      <label>Merknad<textarea rows="2"></textarea></label>
     </div>
     <div class="family-activity-dialog-actions"><button id="family-activity-back" type="button">Avbryt</button><button id="family-activity-save" type="submit">Lagre aktivitet</button></div>
    </form></dialog></body></html>`,{waitUntil:'load'});
   await page.evaluate(()=>document.getElementById('family-activity-dialog').showModal());
   const basic=await page.evaluate(()=>{
    const rect=id=>document.getElementById(id).getBoundingClientRect().toJSON();
    return {cancel:rect('family-activity-back'),save:rect('family-activity-save'),
     chooser:[...document.querySelectorAll('.family-activity-child-choices button')].map(el=>el.getBoundingClientRect().toJSON())};
   });
   for(const rect of [basic.cancel,basic.save,...basic.chooser]){
    assert.ok(rect.height>=47.5,'Touch height too short '+JSON.stringify(rect));
    assert.ok(rect.left>=-2&&rect.right<=width+2,'Overflow at '+width+'px: '+JSON.stringify(rect));
   }
   await page.evaluate(()=>{
    const body=document.body;
    body.dataset.mobileKeyboard='open';
    body.style.setProperty('--mobile-vv-height','440px');
    body.style.setProperty('--mobile-vv-top','0px');
    const dialog=document.getElementById('family-activity-dialog');
    dialog.scrollTop=dialog.scrollHeight;
   });
   const keyboard=await page.evaluate(()=>{
    const dialog=document.querySelector('dialog');
    dialog.scrollTop=dialog.scrollHeight;
    return {dialog:dialog.getBoundingClientRect().toJSON(),
     save:document.getElementById('family-activity-save').getBoundingClientRect().toJSON()};
   });
   assert.ok(keyboard.dialog.bottom<=442,'Dialog goes below simulated keyboard');
   assert.ok(keyboard.save.bottom<=442,'Save action hidden by simulated keyboard');
  }finally{await context.close();}
 });
}
