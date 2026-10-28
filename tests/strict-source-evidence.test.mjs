import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAIPlan,AI_SCHEMA_VERSION} from '../lib/ai-plan.mjs';
import {groupLabel,scopedGroup,sourcedGroup} from '../public/shared/group-scope.mjs';
import {dueDayLabel} from '../public/shared/plan-display.mjs';
const meta=(grade,text)=>({grade,week:44,year:2026,source:'https://www.minskole.no/fagerholt/seksjon/22636',pdf:'https://www.minskole.no/fagerholt-uke44.pdf',pageCount:1,pageTexts:[text]});
const basic={days:[],homework:[],packing:[],notices:[],learningGoals:[],subjects:[],specialContent:[],weekTheme:{text:null,sourcePage:null,sourceQuote:''},optionalMission:{text:null,sourcePage:null,sourceQuote:''},coverage:{state:'complete',reason:''}};
const ev=(title,group,quote)=>({title,group,time:null,sourcePage:1,sourceQuote:quote});
const hw=(dueDay,quote)=>({subject:'Norsk',text:'Les teksten',dueDay,group:null,sourcePage:1,sourceQuote:quote});
test('Fagerholt 7: green colour without explicit group is not a badge',()=>{
 assert.equal(groupLabel('Grønn gruppe','Vi jobber med grønn natur'),null);
 assert.equal(scopedGroup(null,'Vi går tur i grønn skog på mandag','Mandag'),null);
 const raw={...basic,days:[{day:'Mandag',events:[ev('Naturfag om grønn natur','Grønn gruppe','Naturfag om grønn natur mandag')]}]};
 const p=normalizeAIPlan(raw,meta('7','Naturfag om grønn natur mandag'));
 assert.equal(p.days.Mandag.events[0].group,undefined);
});
test('Fagerholt 7: even a fabricated quoted group is rejected if original PDF lacks it',()=>{
 const raw={...basic,days:[{day:'Mandag',events:[ev('Norsk','Grønn gruppe','Grønn gruppe leser norsk på mandag')]}]};
 const p=normalizeAIPlan(raw,meta('7','Norsk lesing på mandag'));
 assert.equal(p.days.Mandag.events[0].group,undefined);
 assert.equal(sourcedGroup('Grønn gruppe','Grønn gruppe leser norsk på mandag','Mandag','Norsk lesing på mandag'),null);
});
test('Fagerholt 3: AI-suggested Tuesday due date without source support is removed',()=>{
 const raw={...basic,homework:[hw('Tirsdag','Norsk: Les teksten hjemme denne uka')]};
 const p=normalizeAIPlan(raw,meta('3','Norsk: Les teksten hjemme denne uka'));
 assert.equal(p.homework[0].dueDay,null);
 assert.equal(dueDayLabel(p.homework[0],{allowTextFallback:false}),null);
});
test('Fagerholt 3: a fabricated AI quote containing til tirsdag is not sufficient',()=>{
 const raw={...basic,homework:[hw('Tirsdag','Norsk: Les teksten, til tirsdag')]};
 const p=normalizeAIPlan(raw,meta('3','Norsk: Les teksten hjemme denne uka'));
 assert.equal(p.homework[0].dueDay,null);
});
test('Explicit homework deadline supported by source quote and original PDF is retained',()=>{
 const quote='Norsk: Les teksten, lekse til tirsdag';
 const p=normalizeAIPlan({...basic,homework:[hw('Tirsdag',quote)]},meta('3',quote));
 assert.equal(p.homework[0].dueDay,'Tirsdag');
 assert.equal(dueDayLabel(p.homework[0],{allowTextFallback:false}),'Til tirsdag');
});
test('Fagerholt 3: two independently documented swim groups stay separate',()=>{
 const quote='Rød gruppe: svømming mandag. Grønn gruppe: svømming tirsdag.';
 const raw={...basic,days:[{day:'Mandag',events:[ev('Svømming',null,quote)]},{day:'Tirsdag',events:[ev('Svømming',null,quote)]}]};
 const p=normalizeAIPlan(raw,meta('3',quote));
 assert.equal(p.days.Mandag.events[0].group,'Rød gruppe');
 assert.equal(p.days.Tirsdag.events[0].group,'Grønn gruppe');
});
test('Cache schema bump prevents old inferred group and deadline results',()=>assert.equal(AI_SCHEMA_VERSION,8));
