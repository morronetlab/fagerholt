import test from 'node:test';
import assert from 'node:assert/strict';
import {withoutContactFooter} from '../lib/homework-contact-boundary.mjs';
import {routeHomeworkPieces,classifyHomeworkText,packingLabels} from '../lib/homework-routing.mjs';
import {explicitPackingInPdf,extractExplicitSchoolPacking} from '../lib/packing-source.mjs';
import {reconcileHomeworkWithPdf} from '../lib/homework-source-truth.mjs';
import {extractHomeworkDeadlineCells} from '../lib/homework-grid.mjs';
import {analyzePdfPages} from '../lib/plan-core.mjs';
import {normalizeAIPlan} from '../lib/ai-plan.mjs';
import {needsCachedEvidenceRefresh,refreshCachedEvidence} from '../lib/plan-cache-evidence.mjs';

// Source-shaped regression tests for reports filed for week 46, not claims
// that the original URLs have been downloaded or their contents verified.
const pdf='https://www.minskole.no/DynamicContent/Documents/uke-46.pdf';
const source='https://www.minskole.no/fagerholt/seksjon/22636';
const tok=(text,x,y)=>({text,x,y,width:Math.min(260,text.length*4)});

test('Reading homework excludes a contact footer without deleting the reading assignment',()=>{
 const text='Norsk: Les i valgfri bok i 20 minutter.\nKontaktinformasjon\nTelefon: 38 12 34 56\nE-post: laerer@skole.no';
 assert.equal(withoutContactFooter(text),'Norsk: Les i valgfri bok i 20 minutter.');
 const routed=routeHomeworkPieces([{subject:'Norsk',text,dueDay:'Torsdag'}]);
 assert.equal(routed.length,1);
 assert.equal(routed[0].kind,'homework');
 assert.equal(routed[0].item.text,'Norsk: Les i valgfri bok i 20 minutter.');
 assert.equal(withoutContactFooter('Skriv en e-post til kontaktlærer med tre spørsmål.'),
  'Skriv en e-post til kontaktlærer med tre spørsmål.');
 assert.equal(withoutContactFooter('Les en bok om telefonens historie.'),'Les en bok om telefonens historie.');
 assert.equal(withoutContactFooter('Les i boka. Tlf: 38 12 34 56 E-post: laerer@skole.no'),'Les i boka.');
});

test('Explicit optional teddy bear and obligatory firewood/food require source instructions',()=>{
 const page='Til mandag: Husk å ta med bålmat og en vedkubbe.\nTil fredag: Du kan pakke en bamse i skolesekken.';
 assert.equal(explicitPackingInPdf('Bålmat','Husk å ta med bålmat',page),true);
 assert.equal(explicitPackingInPdf('Vedkubbe','Husk å ta med vedkubbe',page),true);
 assert.equal(explicitPackingInPdf('Bamse','Du kan pakke en bamse i skolesekken',page),true);
 assert.equal(explicitPackingInPdf('Bamse','Bamse er tema denne uka',page),false);
 assert.equal(explicitPackingInPdf('Bamse','Du kan pakke en bamse','Vi leser om bamser.'),false);
 assert.deepEqual(packingLabels('Ta med bålmat og vedkubbe'),['Vedkubbe','Bålmat']);
 assert.deepEqual(packingLabels('Kan pakke en bamse'),['Bamse']);
 assert.equal(classifyHomeworkText('Kan pakke en bamse på fredag.').kind,'packing');
});

test('Rules fallback includes exact equipment only when attached to an explicit weekday reminder',()=>{
 const page={width:900,height:700,items:[
  tok('Mandag: Husk å ta med bålmat og vedkubbe.',35,120),
  tok('Fredag: Du kan pakke en bamse i skolesekken.',35,170),
  tok('Vi snakker om bamser i norsk.',35,220)
 ]};
 const result=analyzePdfPages([page],'3',pdf,46,2026,source);
 assert.ok(result.days.Mandag.bring.some(x=>x.label==='Bålmat'));
 assert.ok(result.days.Mandag.bring.some(x=>x.label==='Vedkubbe'));
 assert.ok(result.days.Fredag.bring.some(x=>/Bamse.*valgfritt/.test(x.label)));
 assert.ok(!result.days.Tirsdag.bring.some(x=>/bamse/i.test(x.label)));
});

test('Explicit Lekser til headers are individually source-backed deadlines in a horizontal PDF grid',()=>{
 const page={width:1050,height:740,items:[
  tok('LEKSEPLAN UKE 46',30,100),
  tok('Lekser til tirsdag',95,150),
  tok('Lekser til onsdag',355,150),
  tok('Lekser til torsdag',615,150),
  tok('Norsk: Les i leseboka.',98,205),
  tok('Matte: Regn side 42.',358,205),
  tok('Norsk: Les 15 minutter.',618,205),
  tok('Beskjeder',30,355)
 ]};
 const tasks=extractHomeworkDeadlineCells([page]);
 assert.deepEqual(tasks.map(x=>x.dueDay),['Tirsdag','Onsdag','Torsdag']);
 assert.ok(tasks[0].text.includes('Les i leseboka'));
 assert.ok(tasks[1].text.includes('Regn side 42'));
 assert.deepEqual(extractHomeworkDeadlineCells([{...page,items:page.items.filter(x=>x.text!=='LEKSEPLAN UKE 46'
  &&!x.text.startsWith('Lekser til')).concat([tok('Tirsdag',95,150),tok('Onsdag',355,150),
   tok('Torsdag',615,150)])}]),[],'Timetable weekdays alone are not homework proof');
});


test('Original week 46 Sjøstrand text positions: centred day headers, weekly reading, Wed–Thu counting and Friday shoes',()=>{
 const page={width:800,height:850,items:[
  tok('Lekser til tirsdag',91,373),tok('Lekser til onsdag',306,373),
  tok('Lekser til torsdag',501,373),tok('Lekser til fredag',687,373),
  tok('Norsk:',27,403),tok('Les s.',65,403),tok('68',98,403),
  tok('-',110,403),tok('69',114,403),tok('i Fabel lesebok.',129,403),
  tok('Teksten leses 3 ganger. Dette gjøres',27,416),tok('3',211,416),
  tok('dager i løpet av uka, velg dag selv.',27,429),
  tok('Ukelekse:',27,454),tok('Gjør eget ark i leksemappa.',85,454),
  tok('Elevene får utdelt leksemappa mandager',27,479),
  tok('og vi samler den inn torsdager.',27,492),
  tok('Øv på å telle oppover til 40 og',247,404),tok('nedover fra 40.',247,418),
  tok('Øv på å telle oppover til 40',459,404),tok('og nedover fra 40.',459,418),
  tok('Ta med gymsko.',639,404),tok('Kontaktlærere:',27,523)
 ]};
 const raw=extractHomeworkDeadlineCells([page]);
 assert.ok(raw.some(x=>x.text.includes('Les s.')&&x.dueDay===null));
 assert.ok(raw.some(x=>x.text.includes('Gjør eget ark')&&x.dueDay===null));
 assert.ok(raw.some(x=>x.text.includes('Øv på å telle')&&x.dueDay==='Onsdag'));
 assert.ok(raw.some(x=>x.text.includes('Øv på å telle')&&x.dueDay==='Torsdag'));
 assert.ok(raw.some(x=>x.text==='Ta med gymsko.'&&x.dueDay==='Fredag'));
 const checked=reconcileHomeworkWithPdf([], [page]).homework;
 assert.ok(checked.some(x=>x.repeatDays?.join('|')==='Onsdag|Torsdag'));
 assert.ok(!checked.some(x=>/Kontaktlærere|Elevene får utdelt|gymsko/i.test(x.text)));
 const pieces=routeHomeworkPieces(raw,task=>task.dueDay);
 assert.ok(pieces.some(x=>x.kind==='packing'&&x.day==='Fredag'&&x.labels.includes('Gymsko')));
});

test('Original week 46 paragraph positions recover conditional Monday and Friday equipment',()=>{
 const fagerholt={width:595,height:842,items:[
  tok('Uteskole:',76,163),
  tok('Mandag er det tid for uteskole igjen. Denne gangen går turen til Speiderhytta. De som',126,163),
  tok('vil kan ta med seg bålmat. Ta med en vedkubbe hvis du har. Husk å kle deg godt!',76,178)
 ]};
 const wilds={width:595,height:842,items:[
  tok('Fredag markerer vi avslutning av perioden. Elevene kan da ta med seg en',79,222),
  tok('bamse hvis de har lyst.',79,239)
 ]};
 assert.deepEqual(extractExplicitSchoolPacking([fagerholt])
  .map(x=>[x.day,x.label]).sort(),[
  ['Mandag','Bålmat (valgfritt)'],['Mandag','Vedkubbe (valgfritt)']]);
 assert.deepEqual(extractExplicitSchoolPacking([wilds]).map(x=>[x.day,x.label]),
  [['Fredag','Bamse (valgfritt)']]);
 assert.equal(withoutContactFooter('Les 15 minutter i valgfri bok. minskole.no/wildsminne'),
  'Les 15 minutter i valgfri bok.');
});


test('Cached AI plans are repaired against original PDF, without new model requests',()=>{
 const empty=()=>({events:[],bring:[]});
 const old={schoolId:'wildsminne',grade:'7',year:2026,week:46,parser:'ai',
  aiStatus:'ready',sourceAudit:{status:'ok'},
  homework:[{subject:'Norsk',dueDay:'Torsdag',
   text:'Les 15 minutter i valgfri bok. minskole.no/wildsminne'}],
  days:Object.fromEntries(['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'].map(d=>[d,empty()])),
  notices:[],dayNotes:{},everyday:[],contacts:[],vocabulary:[]};
 const page={width:595,height:842,items:[
  tok('Fredag markerer vi avslutning. Elevene kan da ta med seg en',79,222),
  tok('bamse hvis de har lyst.',79,239)
 ]};
 assert.equal(needsCachedEvidenceRefresh(old),true);
 const result=refreshCachedEvidence(old,[page]);
 assert.equal(result.changed,true);
 assert.equal(result.plan.feedbackSourceRepairVersion,1);
 assert.deepEqual(result.plan.days.Fredag.bring,[{label:'Bamse (valgfritt)'}]);
 assert.equal(result.plan.homework[0].text,'Les 15 minutter i valgfri bok.');
 assert.equal(old.homework[0].text,'Les 15 minutter i valgfri bok. minskole.no/wildsminne');
 assert.deepEqual(old.days.Fredag.bring,[],'Never mutate shared cached source objects');
});

test('AI normalization does not invent a weekday when the instruction contains no day',()=>{
 const body='Du kan pakke en bamse i skolesekken på fredag.';
 const raw={days:[],dayNotes:[],attendance:[],homework:[],packing:[{
  label:'Bamse',day:'Fredag',evidence:'explicit',group:null,
  sourceQuote:body,sourcePage:1,note:null
 }],notices:[],vocabulary:[],learningGoals:[],subjects:[],contacts:[],specialContent:[],
 weekTheme:{text:null,sourceQuote:'',sourcePage:null},
 optionalMission:{text:null,sourceQuote:'',sourcePage:null},
 coverage:{state:'complete',reason:''}};
 const result=normalizeAIPlan(raw,{grade:'7',week:46,year:2026,source,pdf,pageCount:1,
  pageTexts:['Ukeplan uke 46. '+body],pageLayouts:[]});
 assert.ok(result.days.Fredag.bring.some(x=>x.label==='Bamse (valgfritt)'));
 assert.ok(!Object.values(result.days).filter((_,index)=>index!==4)
  .some(x=>x.bring.some(z=>z.label.includes('Bamse'))));
});
