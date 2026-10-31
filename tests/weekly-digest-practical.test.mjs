import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPracticalDigestHighlights,DIGEST_PRACTICAL_EVIDENCE_VERSION} from '../lib/digest-practical-evidence.mjs';
import {buildWeeklyDigest} from '../lib/weekly-digest.mjs';
import {refreshCachedEvidence,needsCachedEvidenceRefresh} from '../lib/plan-cache-evidence.mjs';
import {HOMEWORK_SOURCE_VERSION} from '../lib/homework-source-truth.mjs';

const now=()=>new Date('2026-11-01T17:45:00Z');
const profile={school:'fagerholt',grade:'3',group:''};
const pdf='https://www.minskole.no/DynamicContent/Documents/ukeplan-uke-45.pdf';
const plan={
 schoolId:'fagerholt',grade:'3',year:2026,week:45,parser:'ai',status:'ok',aiStatus:'ready',
 pdf,homeworkSourceVersion:HOMEWORK_SOURCE_VERSION,
 homework:[],everyday:[],notices:[],attendance:[],
 days:{Fredag:{events:[{title:'Planleggingsdag – elevene har fri'}]}},
 dayNotes:{Onsdag:[{text:'Vaksinasjon onsdag kl. 09. Husk å lese samtykkebrevet.'}]},
 provenance:[],
 sourceAudit:{status:'attention',sourceFacts:2,missing:1,unsupported:0}
};
const pdfText='Ukeplan for uke 45. Fredag: Planleggingsdag – elevene har fri. '+
 'Onsdag: Vaksinasjon onsdag kl. 09. Husk å lese samtykkebrevet. '+
 'Tirsdag skal elevene ha matematikk, og vi øver på regning i grupper.';
const pages=[{items:[{text:pdfText}]}];

test('Vaccine and planning day from Praktisk å huske are verified independently on attention audit',()=>{
 const evidence=verifyPracticalDigestHighlights(plan,pages);
 assert.ok(evidence.some(item=>item.kind==='notice'&&/vaksinasjon/i.test(item.label)));
 assert.ok(evidence.some(item=>item.kind==='event'&&/planleggingsdag/i.test(item.label)));
 assert.ok(evidence.every(item=>item.sourcePage===1));
 const digest=buildWeeklyDigest({profiles:[profile],now,plans:new Map([
  ['fagerholt|3',{...plan,digestPracticalEvidenceVersion:DIGEST_PRACTICAL_EVIDENCE_VERSION,
   digestPracticalHighlights:evidence}]])});
 assert.equal(digest.readyPlans,1,'Important notices alone can make a partial family summary useful');
 assert.equal(digest.sections[0].partial,true);
 assert.match(digest.html,/VIKTIG Å HUSKE/);
 assert.match(digest.html,/Vaksinasjon onsdag kl\. 09/);
 assert.match(digest.html,/Planleggingsdag/);
 assert.ok(digest.html.indexOf('VIKTIG Å HUSKE')<digest.html.indexOf('LEKSER OG FRISTER'));
 assert.match(digest.text,/Vaksinasjon/);
 assert.match(digest.text,/Original PDF/);
});
test('Unsubstantiated health or closure is never added just because an AI plan says it',()=>{
 const fake={...plan,
  dayNotes:{...plan.dayNotes,Mandag:[{text:'Vaksine mandag: Alle elever må møte på månen.'}]},
  days:{...plan.days,Torsdag:{events:[{title:'Torsdag er alle skolene stengt på grunn av romfart.'}]}}};
 const evidence=verifyPracticalDigestHighlights(fake,pages);
 assert.ok(!evidence.some(item=>/månen|romfart/i.test(item.label)));
 assert.ok(evidence.some(item=>/Vaksinasjon onsdag/i.test(item.label)));
});
test('Source evidence is populated from original PDF once for legacy caches',()=>{
 const old={...plan,digestPracticalEvidenceVersion:null};
 assert.equal(needsCachedEvidenceRefresh(old),true);
 const result=refreshCachedEvidence(old,pages);
 assert.equal(result.changed,true);
 assert.equal(result.plan.digestPracticalEvidenceVersion,DIGEST_PRACTICAL_EVIDENCE_VERSION);
 assert.ok(result.plan.digestPracticalHighlights.length>=2);
 assert.equal(needsCachedEvidenceRefresh(result.plan),false);
});
test('No proof in an attention audit means no sensitive school notice in email',()=>{
 const result=buildWeeklyDigest({profiles:[profile],now,plans:new Map([
  ['fagerholt|3',{...plan,digestPracticalEvidenceVersion:DIGEST_PRACTICAL_EVIDENCE_VERSION,
    digestPracticalHighlights:[]}]])});
 assert.equal(result.readyPlans,0);
 assert.doesNotMatch(result.html,/Vaksinasjon onsdag kl\. 09/);
});
