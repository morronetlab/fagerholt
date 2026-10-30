import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {findPdfLinks,choosePdf} from '../lib/plan-core.mjs';
import {normalizeAIPlan,AI_SCHEMA_VERSION} from '../lib/ai-plan.mjs';
import {groupLabel,scopedGroup} from '../public/shared/group-scope.mjs';
import {dueDayLabel,displayEvent,packingText} from '../public/shared/plan-display.mjs';
import {adjustableVisualRegion,visualCropGeometry,normalizeVisualRegion} from '../public/shared/visual-region.mjs';
const file=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const quote='Rød gruppe: mandag, Grønn gruppe: tirsdag; 5A møter kl 8, 5B møter kl 9; Lekse til tirsdag. Ta med badetøy til svømming.';
const evidence={sourcePage:1,sourceQuote:quote};
const base={days:[],homework:[],packing:[],notices:[],learningGoals:[],subjects:[],specialContent:[],
 weekTheme:{text:null,sourcePage:null,sourceQuote:''},optionalMission:{text:null,sourcePage:null,sourceQuote:''},
 coverage:{state:'complete',reason:''}};
const meta={grade:'3',week:44,year:2026,source:'https://www.minskole.no/fagerholt/seksjon/22636',
 pdf:'https://www.minskole.no/DynamicContent/Documents/fagerholt-uke44.pdf',pageCount:1,pageTexts:[quote]};

test('Dvergsnes grade 6: title Ukeplan 6. trinn uke 44 means week 44, not week 6',()=>{
 const pdf='https://www.minskole.no/DynamicContent//Documents/dvergsnes-6-trinn-uke-44.pdf';
 const html='<a href="'+pdf+'">Ukeplan 6. trinn uke 44</a>';
 const links=findPdfLinks(html,'https://www.minskole.no/dvergsnes/seksjon/21677');
 assert.equal(links[0]?.week,44);assert.equal(choosePdf(links,44)?.url,pdf);
});
test('Finsland grade 6: lesson deadlines survive even when their subject is present',()=>{
 const raw={...base,homework:[{dueDay:'Tirsdag',subject:'Norsk',text:'Les 10 minutter',group:null,sourcePage:1,sourceQuote:'Norsk: Les 10 minutter, lekse til tirsdag'},
 {dueDay:'Onsdag',subject:'Matematikk',text:'Gjør side 5',group:null,sourcePage:1,sourceQuote:'Matematikk: Gjør side 5, lekse til onsdag'}]};
 const r=normalizeAIPlan(raw,{...meta,grade:'6',pageTexts:['Norsk: Les 10 minutter, lekse til tirsdag. Matematikk: Gjør side 5, lekse til onsdag']});
 assert.deepEqual(r.homework.map(x=>x.subject),['Norsk','Matematikk']);
 assert.deepEqual(r.homework.map(dueDayLabel),['Til tirsdag','Til onsdag']);
});
test('Fagerholt: red group Monday and green group Tuesday are not confused',()=>{
 assert.equal(scopedGroup(null,quote,'Mandag'),'Rød gruppe');
 assert.equal(scopedGroup(null,quote,'Tirsdag'),'Grønn gruppe');
 assert.equal(scopedGroup('Grønn gruppe',quote,'Mandag'),'Rød gruppe');
 assert.equal(groupLabel('5B','5A møter kl 08'),null);
 const raw={...base,days:[{day:'Mandag',events:[{title:'Svømming',time:null,group:null,...evidence}]},
 {day:'Tirsdag',events:[{title:'Svømming',time:null,group:null,...evidence}]}],
 packing:[{day:'Mandag',label:'Badetøy',note:null,evidence:'explicit',group:null,...evidence},
 {day:'Tirsdag',label:'Badetøy',note:null,evidence:'explicit',group:null,...evidence}]};
 const r=normalizeAIPlan(raw,meta);
 assert.equal(r.days.Mandag.events[0].group,undefined);
 assert.equal(r.days.Tirsdag.events[0].group,undefined);
 assert.equal(r.days.Mandag.bring[0].group,undefined);
 assert.equal(r.days.Tirsdag.bring[0].group,undefined);
});
test('Fagerholt grade 7: finishing time goes below activity; packing tokens separate',()=>{
 assert.equal(displayEvent({title:'Skolen slutt kl. 14.15',time:null}).endTime,'Slutt kl. 14:15');
 assert.equal(displayEvent({title:'Matematikk',time:'Slutt kl. 13:30'}).time,null);
 assert.equal(packingText('inneskoTilinnegym'),'innesko · Til innegym');
 assert.match(file('../public/app.js'),/class="event-endtime"/);
});
test('PDF crop allows separate widening horizontally and vertically',()=>{
 const r={x:200,y:250,width:300,height:240};
 const initial=adjustableVisualRegion(r),side=adjustableVisualRegion(r,{horizontal:2}),vertical=adjustableVisualRegion(r,{vertical:2});
 assert.ok(side.width>initial.width);assert.equal(side.height,initial.height);
 assert.ok(vertical.height>initial.height);assert.equal(vertical.width,initial.width);
 assert.ok(visualCropGeometry(side,800,950,400,1));
 assert.equal(normalizeVisualRegion({x:0,y:0,width:1000,height:1000}),null);
});
test('Lunde named Grublis/Lunde på linja text survives if special model output omits both',()=>{
 const raw={...base,notices:[{day:null,text:'Skoleinformasjon',group:null,...evidence}]};
 const r=normalizeAIPlan(raw,{...meta,pageTexts:['Grublis: Hvor mange bein har dyrene på bildet? Lunde på linja: Telefonen er 150 år.']});
 assert.deepEqual(r.specialContent.map(x=>x.title),['Grublis','Lunde på linja']);
 assert.ok(r.specialContent.every(x=>!x.hasVisual));
});
test('AI wait visual shows actual elapsed time, not fictional numeric percent',()=>{
 const html=file('../public/index.html'),app=file('../public/app.js'),css=file('../public/original-look.css');
 assert.match(html,/id="analysis-progress"/);assert.match(html,/id="analysis-elapsed"/);
 assert.match(html,/id="analysis-progress-track"/);assert.match(html,/id="day-group-summary"/);
 assert.match(app,/updateAnalysisClock/);assert.match(app,/classList\.toggle\('ai-pending',pending\)/);
 assert.match(app,/state\.aiPolls<240/);assert.match(css,/analysis-progress/);
 assert.ok(AI_SCHEMA_VERSION>=6);
});
