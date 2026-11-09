import test from 'node:test';
import assert from 'node:assert/strict';
import {withoutContactFooter} from '../lib/homework-contact-boundary.mjs';
import {routeHomeworkPieces,classifyHomeworkText,packingLabels} from '../lib/homework-routing.mjs';
import {explicitPackingInPdf} from '../lib/packing-source.mjs';
import {extractHomeworkDeadlineCells} from '../lib/homework-grid.mjs';
import {analyzePdfPages} from '../lib/plan-core.mjs';
import {normalizeAIPlan} from '../lib/ai-plan.mjs';

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
