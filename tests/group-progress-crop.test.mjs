import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeAIPlan,AI_SCHEMA,AI_SCHEMA_VERSION} from '../lib/ai-plan.mjs';
import {groupLabel,homeworkProgress} from '../public/shared/group-scope.mjs';
import {paddedVisualRegion,normalizeVisualRegion,fullPageGeometry,visualCropGeometry} from '../public/shared/visual-region.mjs';

const quote='Rød gruppe skal ha svømming mandag. Grønn gruppe skal ha svømming tirsdag. 5A møter på bussen. 5B møter ved hallen.';
const e={sourcePage:1,sourceQuote:quote};
const base={days:[],homework:[],packing:[],notices:[],learningGoals:[],subjects:[],specialContent:[],weekTheme:{text:null,sourcePage:null,sourceQuote:''},optionalMission:{text:null,sourcePage:null,sourceQuote:''},coverage:{state:'complete',reason:''}};
const meta={grade:'3',week:44,year:2026,source:'https://www.minskole.no/fagerholt/seksjon/22636',pdf:'https://www.minskole.no/DynamicContent/Documents/854-fagerholt-uke-44.pdf',pageCount:1,pageTexts:[quote]};

test('Fagerholt: red and green swim groups remain separate by day and equipment',()=>{
 const x={...base,
 days:[{day:'Mandag',events:[{title:'Svømming',time:null,group:'Rød gruppe',...e}]},{day:'Tirsdag',events:[{title:'Svømming',time:null,group:'Grønn gruppe',...e}]}],
 packing:[{day:'Mandag',label:'Badetøy',note:null,evidence:'explicit',group:'Rød gruppe',...e},
  {day:'Tirsdag',label:'Badetøy',note:null,evidence:'explicit',group:'Grønn gruppe',...e}],
 notices:[{day:null,text:'Møte ved bussen',group:'5A',...e}]};
 const result=normalizeAIPlan(x,meta);
 assert.equal(result.days.Mandag.events[0].group,'Rød gruppe');
 assert.equal(result.days.Tirsdag.events[0].group,'Grønn gruppe');
 assert.equal(result.days.Mandag.bring[0].group,'Rød gruppe');
 assert.equal(result.days.Tirsdag.bring[0].group,'Grønn gruppe');
 assert.deepEqual(result.notices,[{text:'Møte ved bussen',group:'5A'}]);
});
test('Lunde: A/B classroom items are preserved independently, even for the same packing item',()=>{
 const x={...base,packing:[{day:'Fredag',label:'Gymtøy',note:null,evidence:'explicit',group:'5A',...e},
 {day:'Fredag',label:'Gymtøy',note:null,evidence:'explicit',group:'5B',...e}],
 homework:[{dueDay:'Fredag',subject:'Norsk',text:'Les teksten',group:'5A',...e},
 {dueDay:'Fredag',subject:'Norsk',text:'Les teksten',group:'5B',...e}]};
 const result=normalizeAIPlan(x,{...meta,grade:'5'});
 assert.equal(result.days.Fredag.bring.length,2);
 assert.deepEqual(result.days.Fredag.bring.map(x=>x.group),['5A','5B']);
 assert.deepEqual(result.homework.map(x=>x.group),['5A','5B']);
});
test('Group labels are refused when the individual source quote does not mention the group',()=>{
 assert.equal(groupLabel('Rød gruppe','Ta med badetøy'),null);
 assert.equal(groupLabel('5A','Dette gjelder 5B'),null);
 assert.equal(groupLabel('Grønn gruppe','Grønn gruppe: svømming på tirsdag'),'Grønn gruppe');
 assert.equal(groupLabel('5A','5A møter kl 8'),'5A');
 assert.equal(groupLabel('Rød gruppe','Rød gruppe og Grønn gruppe har svømming'),'Rød gruppe');
 assert.equal(groupLabel('Alle elever','Alle elever har lekse'),null);
});
test('AI schema has required group fields and invalidates old cache schema',()=>{
 assert.equal(AI_SCHEMA_VERSION,5);
 for(const item of [AI_SCHEMA.properties.days.items.properties.events.items,
  AI_SCHEMA.properties.homework.items,AI_SCHEMA.properties.packing.items,
  AI_SCHEMA.properties.notices.items,AI_SCHEMA.properties.learningGoals.items,
  AI_SCHEMA.properties.specialContent.items]){
  assert.deepEqual(item.properties.group.type,['string','null']);
  assert.ok(item.required.includes('group'));
 }
});
test('Homework bar has correct progress and is complete only if all homework checked',()=>{
 const items=[{text:'Norsk'},{text:'Matte'},{text:'Engelsk'}];
 assert.deepEqual(homeworkProgress([],()=>true),{total:0,done:0,percent:0,complete:false});
 assert.deepEqual(homeworkProgress(items,()=>false),{total:3,done:0,percent:0,complete:false});
 assert.deepEqual(homeworkProgress(items,i=>i<2),{total:3,done:2,percent:67,complete:false});
 assert.deepEqual(homeworkProgress(items,()=>true),{total:3,done:3,percent:100,complete:true});
});
test('Expanded crops include larger safe bounds while full-page view never clips content',()=>{
 const r={x:200,y:250,width:300,height:200};
 const padded=paddedVisualRegion(r);
 assert.deepEqual(padded,{x:155,y:185,width:390,height:330});
 assert.ok(padded.width>r.width && padded.height>r.height);
 assert.ok(visualCropGeometry(padded,600,840,440,2));
 const full=fullPageGeometry(600,840,440,2);
 assert.equal(full.transform[4],0);
 assert.equal(full.transform[5],0);
 assert.ok(full.cssHeight>full.cssWidth);
 assert.equal(normalizeVisualRegion({x:0,y:0,width:1000,height:1000}),null);
});
test('Accessible progress and the per-image full-page escape route exist in the UI',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const script=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/original-look.css',import.meta.url),'utf8');
 assert.match(html,/id="homework-progress-track"[^>]*role="progressbar"/);
 assert.match(html,/id="homework-progress-message" aria-live="polite"/);
 assert.match(script,/data-special-expand/);
 assert.match(script,/fullPageGeometry/);
 assert.match(script,/groupBadge\(x\.group\)/);
 assert.match(script,/homeworkProgress\(homework/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
