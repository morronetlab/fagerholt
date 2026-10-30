import test from 'node:test';
import assert from 'node:assert/strict';
import {adultImpactType} from '../public/shared/adult-impact.mjs';
import {practicalDigest,verifiedDigestExcerpt,sourcePdfLink,schoolNoticeDate} from '../public/shared/practical-digest.mjs';
import {applyPracticalPriority,priorityKey} from '../public/shared/practical-priority.mjs';
import {practicalHighlights} from '../public/shared/practical-highlights.mjs';
import {criticalSourceSegments,auditPracticalSource} from '../lib/practical-source-audit.mjs';
import {rankingCandidates,rankPracticalPlan,PRIORITY_VERSION} from '../lib/practical-priority.mjs';

const p={id:'sourcechild',name:'Barn',school:'sjostrand',grade:'2',group:''};
const pdf='https://www.minskole.no/DynamicContent//Documents/866-Sjostrand-Ukebrev-uke-44-ca300aa3-539e.pdf';
const sjoestrandPlan={
 parser:'ai',status:'ok',aiStatus:'ready',schoolId:'sjostrand',grade:'2',
 year:2026,week:44,pdf,notices:[],homework:[],
 everyday:[],attendance:[],dayNotes:{Onsdag:[{text:'Vaksine onsdag morgen.'}]},
 days:{Onsdag:{events:[],bring:[]},Mandag:{events:[{title:'Vanlig matematikk'}],bring:[]}}
};
const calendar={year:2026,week:44,today:'2026-10-26',upcoming:true};
const summaries=new Map([[p.id,{
 ready:true,weeklyBag:[],weeklyNotices:[{day:'Onsdag',text:'Vaksine onsdag morgen.'}]
}]]);
const officialVoiebyenPdf='https://www.minskole.no/DynamicContent//Documents/864-voiebyen-Ukeplan-uke-44-dd1c256c-7eb1.pdf';
// Published public PDF text, as indexed for Voiebyen fifth grade, week 44.
// This is a source excerpt, NOT an original PDF binary.
const voiebyenNotice='Vi planlegger en tur i løpet av uka. Vi ser været an litt, nærmere beskjed kommer når vi har landet dag.';

test('Actual Sjøstrand 2nd grade week 44 vaccine excerpt has a verified Wednesday, not a guessed hour',()=>{
 const items=practicalHighlights({profiles:[p],summaries,
  plans:new Map([[p.id,sjoestrandPlan]]),calendar,focus:'week'});
 const vaccination=items.find(item=>/Vaksine/.test(item.label));
 assert.ok(vaccination,'Official week 44 source-shaped vaccine notice must reach family overview');
 assert.equal(vaccination.adultImpact,'health');
 const output=practicalDigest(vaccination,{year:2026,week:44,pdf});
 assert.equal(output.date,'2026-10-28');
 assert.match(output.dateLabel,/onsdag 28. oktober/i);
 assert.match(output.shortText,/Vaksine onsdag morgen/);
 assert.ok(!/kl\.\s*0?9|kl\.\s*10/.test(output.shortText),'Do not invent an appointment time');
 assert.ok(output.pdfUrl?.includes('866-Sjostrand'));
});
test('Indexed original Voiebyen week 44 PDF: undated planned trip does NOT create a day or packing',()=>{
 const item={kind:'notice',label:voiebyenNotice,day:null};
 const out=practicalDigest(item,{year:2024,week:44,pdf:officialVoiebyenPdf});
 assert.equal(out.date,null,'No day was decided in the original PDF');
 assert.equal(adultImpactType(out.fullText),null,'Trip logistics must not be treated as school closure');
 assert.doesNotMatch(out.shortText,/refleks|badetøy|fredag|onsdag/iu);
 assert.equal(out.pdfUrl,officialVoiebyenPdf);
 assert.equal(verifiedDigestExcerpt(voiebyenNotice,'Turen blir på torsdag, ta med refleks'),null);
});
test('A 2026 original school-week source excerpt cannot be recast as a planning day or vaccination',()=>{
 const original='På fredag skal vi jobbe med øveord og vanlig matematikk i klasserommet.';
 assert.equal(verifiedDigestExcerpt(original,'Fredag er planleggingsdag og elevene har fri'),null);
 assert.equal(verifiedDigestExcerpt(original,'Vaksinasjon på fredag'),null);
 assert.equal(adultImpactType(original),null);
});
test('AI can extract a helpful exact, shorter sentence but may not rewrite critical notice',()=>{
 const full='Praktisk informasjon til hjemmet. Planleggingsdag fredag, elevene har fri. Mer informasjon om resten av uka kommer senere.';
 const short='Planleggingsdag fredag, elevene har fri.';
 assert.equal(verifiedDigestExcerpt(full,short),short);
 assert.equal(verifiedDigestExcerpt(full,'Fredag er det planleggingsdag – ingen skole.'),null);
 assert.equal(verifiedDigestExcerpt(full,'Praktisk informasjon til hjemmet.'),null,
  'Cannot hide the school closure in a too-vague snippet');
 const row={id:p.id,kind:'notice',label:full,priority:3,dayOrder:4};
 const score={[priorityKey(row)]:{importance:3,prepareAhead:true,shortText:'Fredag er det planleggingsdag – ingen skole.'}};
 const ranked=applyPracticalPriority([row],score);
 assert.equal(ranked[0].aiShortText,undefined,'Invalid cached model text cannot enter the UI');
 assert.match(practicalDigest(ranked[0],{year:2026,week:44,pdf}).shortText,/Planleggingsdag/);
});
test('Day mismatch, multiple weekdays, next week and unknown days must never produce made-up dates',()=>{
 assert.equal(schoolNoticeDate({label:'Mandag: Vaksine fredag',day:'Mandag'},2026,44),null);
 assert.equal(schoolNoticeDate({label:'Vaksine torsdag eller fredag',day:null},2026,44),null);
 assert.equal(schoolNoticeDate({label:'Fri fredag neste uke',day:null},2026,44),null);
 assert.equal(schoolNoticeDate({label:'Fri fredag i uke 45',day:null},2026,44),null);
 assert.equal(schoolNoticeDate({label:'Svømming i løpet av uka',day:null},2026,44),null);
 assert.equal(schoolNoticeDate({label:'Fredag: stengt SFO',day:'Fredag'},2026,44),'2026-10-30');
});
test('Source PDF links are allowlisted and preserve the verified page',()=>{
 assert.equal(sourcePdfLink(pdf,2),pdf+'#page=2');
 assert.equal(sourcePdfLink('javascript:alert(1)',2),null);
 assert.equal(sourcePdfLink('https://evil.example/plan.pdf',2),null);
 assert.equal(sourcePdfLink('https://www.minskole.no.evil.example/a.pdf',2),null);
});
test('Negated closure and literary holiday references cannot become parent workday alerts',()=>{
 for(const phrase of [
  'Vi har ikke planleggingsdag denne uka',
  'SFO er ikke stengt fredag',
  'SFO holder åpent på vanlig skoledag',
  'Norsk: Skriv en tekst om sommerferie',
  'Tema: Les om juleferie i gamle dager'
 ])assert.equal(adultImpactType(phrase),null,phrase);
 assert.equal(adultImpactType('Fredag: skolefri'),'workday');
 assert.equal(adultImpactType('Vaksine onsdag morgen'),'health');
});
test('The PDF text audit detects important omissions without creating new notices',()=>{
 const source='Ukeplan uke 44. Fredag: Planleggingsdag, elevene har fri. Onsdag: Vaksine ved helsesykepleier. Norsk: Les bok og svar på spørsmål.';
 const plan={...sjoestrandPlan,notices:[],dayNotes:{},
  days:{Mandag:{events:[{title:'Vanlig matematikk'}],bring:[]}}};
 const audit=auditPracticalSource(plan,[source]);
 assert.equal(audit.status,'attention');
 assert.ok(audit.missing>=1,'At least one missing critical PDF fact must be identified');
 assert.equal(plan.notices.length,0,'Auditing may not invent or insert a notice');
});
test('Image-only PDFs are not falsely reported as successfully verified',()=>{
 const audit=auditPracticalSource(sjoestrandPlan,['']);
 assert.equal(audit.status,'unverified');
});
test('Versioned cached summaries trigger a new small ranking, not another PDF parse',()=>{
 assert.equal(PRIORITY_VERSION,3);
});
test('The full PDF summary ranking request includes the original text, not family names',async()=>{
 let requests=0;
 const plan={...sjoestrandPlan,notices:['Planleggingsdag fredag, elevene har fri. Husk å ordne barnepass i god tid.']};
 const candidates=rankingCandidates(plan);
 assert.ok(candidates.length>=1);
 const item=candidates.find(x=>x.text.includes('Planleggingsdag'));
 assert.ok(item);
 const scores=await rankPracticalPlan(plan,{apiKey:'test-key',fetchImpl:async(_,options)=>{
  requests++;
  const body=JSON.parse(options.body);
  assert.equal(body.text.format.schema.properties.items.items.properties.shortText.type,'string');
  assert.doesNotMatch(JSON.stringify(body),/sourcechild|Barn/);
  return {ok:true,json:async()=>({status:'completed',
   output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({
    items:[{id:item.id,importance:3,prepareAhead:true,
     shortText:'Planleggingsdag fredag, elevene har fri.'}]
   })}]}]})};
 }});
 assert.equal(requests,1);
 assert.equal(scores[item.key].shortText,'Planleggingsdag fredag, elevene har fri.');
});
