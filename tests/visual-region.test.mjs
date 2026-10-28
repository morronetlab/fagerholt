import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeVisualRegion,duplicateVisualRegion,visualCropGeometry} from '../public/shared/visual-region.mjs';
import {AI_SCHEMA_VERSION,AI_SCHEMA,normalizeAIPlan} from '../lib/ai-plan.mjs';
const quote='Kunnskapshjørnet om telefonens jubileum';
const source={sourcePage:1,sourceQuote:quote};
const base={days:[],homework:[],packing:[],notices:[{day:null,text:'Husk markeringen',...source}],learningGoals:[],subjects:[],weekTheme:{text:null,sourcePage:null,sourceQuote:''},optionalMission:{text:null,sourcePage:null,sourceQuote:''},coverage:{state:'complete',reason:''}};
const meta={grade:'6',week:44,year:2026,source:'https://www.minskole.no/presteheia/seksjon/1234',pdf:'https://www.minskole.no/DynamicContent/Documents/860-presteheia-Ukeplan-44-Dyreheia-(1)-de95fb1b-bbf7.pdf',pageTexts:[quote],pageCount:1};
const item=(title,visualRegion)=>({title,description:'Innhold fra spesialelement',kind:'knowledge',hasVisual:true,visualRegion,...source});
test('Only narrow bounded crops may be displayed, never the entire original PDF page',()=>{
 assert.equal(AI_SCHEMA_VERSION,6);
 assert.ok(AI_SCHEMA.properties.specialContent.items.properties.visualRegion);
 assert.deepEqual(normalizeVisualRegion({x:50,y:120,width:400,height:260}),{x:50,y:120,width:400,height:260});
 for(const x of [null,{x:0,y:0,width:1000,height:1000},{x:-1,y:0,width:400,height:200},{x:700,y:500,width:400,height:600},{x:50.5,y:20,width:250,height:200},{x:0,y:0,width:80,height:900}])assert.equal(normalizeVisualRegion(x),null);
});
test('Presteheia: two topic illustrations on same page retain separate non-overlapping crops',()=>{
 const raw={...base,specialContent:[item('Kunnskapshjørnet', {x:60,y:520,width:420,height:260}),item('Ukens andre tema',{x:550,y:520,width:350,height:260})]};
 const plan=normalizeAIPlan(raw,meta);
 assert.equal(plan.specialContent.length,2);
 assert.ok(plan.specialContent.every(x=>x.hasVisual));
 assert.notDeepEqual(plan.specialContent[0].visualRegion,plan.specialContent[1].visualRegion);
});
test('Duplicate PDF regions never render twice even if titles differ',()=>{
 const r={x:80,y:550,width:450,height:260};
 const raw={...base,specialContent:[item('Kunnskapshjørnet',r),item('Ukens illustrasjon',{x:90,y:560,width:435,height:245})]};
 const plan=normalizeAIPlan(raw,meta);
 assert.equal(plan.specialContent.length,2);
 assert.equal(plan.specialContent[0].hasVisual,true);
 assert.equal(plan.specialContent[1].hasVisual,false);
 assert.equal(plan.specialContent[1].visualRegion,null);
 assert.ok(duplicateVisualRegion(r,{x:90,y:560,width:435,height:245}));
});
test('Lunde: two distinctive visuals crop separately and cannot include the full page',()=>{
 const raw={...base,specialContent:[item('Lunde på linja',{x:40,y:540,width:450,height:240}),item('Grublis',{x:530,y:540,width:420,height:240})]};
 const plan=normalizeAIPlan(raw,{...meta,grade:'5',pdf:'https://www.minskole.no/DynamicContent/Documents/884-lundeskole-Uke-44-(2)-a1b5e3b2-5bd6.pdf'});
 const g=plan.specialContent.map(x=>visualCropGeometry(x.visualRegion,595,842,450,2));
 assert.equal(g.length,2);
 assert.ok(g.every(x=>x&&x.cssHeight<600&&x.pixelHeight<1000));
 assert.notEqual(g[0].transform[4],g[1].transform[4]);
});
test('Uncertain visual region does not produce a misleading full-page illustration',()=>{
 const raw={...base,specialContent:[item('Grublis',null)]};
 const plan=normalizeAIPlan(raw,meta);
 assert.equal(plan.specialContent[0].hasVisual,false);
 assert.equal(plan.specialContent[0].visualRegion,null);
});
