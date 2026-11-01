import test from 'node:test';
import assert from 'node:assert/strict';
import {planAvailability} from '../public/shared/plan-availability.mjs';
import {planFeedback} from '../public/shared/plan-feedback.mjs';
import {profileSummary} from '../public/shared/family-core.mjs';

const school={name:'Fagerholt skole',homepage:'https://www.minskole.no/fagerholt'};
const profile={id:'child-12345678',name:'Barn',school:'fagerholt',grade:'3'};
const cal={year:2026,week:44,weekday:2,today:'2026-10-28'};

test('Unpublished means no matching PDF found on grade page, not a confirmed absence at school',()=>{
 const plan={status:'unpublished',year:2026,week:44,source:'https://www.minskole.no/fagerholt/seksjon/22636'};
 const availability=planAvailability({plan});
 assert.equal(availability.kind,'unpublished');
 assert.match(availability.label,/ikke funnet på trinnsiden/i);
 assert.match(availability.detail,/kan være publisert et annet sted/i);
 const feedback=planFeedback({plan,school,grade:'3'});
 assert.match(feedback.description,/ikke en bekreftelse/i);
 assert.equal(feedback.showGrade,true);
 assert.equal(profileSummary(profile,plan,cal).ready,false);
 assert.match(profileSummary(profile,plan,cal).reason,/trinnside/i);
});
test('Missing grade page, source timeout, PDF download, and parser errors are distinct',()=>{
 const cases=[
  [{status:'unavailable'},'grade_missing',/trinnsiden/i],
  [{status:'error',errorCode:'school_page_failed'},'fetch_error',/hente ukeplan/i],
  [{status:'error',errorCode:'pdf_download_failed',pdf:'https://www.minskole.no/uke44.pdf'},'download_error',/PDF/i],
  [{status:'error',errorCode:'pdf_parse_failed',pdf:'https://www.minskole.no/uke44.pdf'},'parse_error',/tolkes/i],
  [{status:'unreadable',pdf:'https://www.minskole.no/uke44.pdf'},'unreadable',/lesbart/i]
 ];
 for(const [partial,kind,label] of cases){
  const plan={week:44,year:2026,...partial};
  const assessment=planAvailability({plan});
  assert.equal(assessment.kind,kind);
  assert.match(assessment.label,label);
  assert.doesNotMatch(assessment.label,/ikke publisert/i);
  const sum=profileSummary(profile,plan,cal);
  assert.equal(sum.ready,false);
  assert.match(sum.reason,/PDF|skole|trinnside|tekstlag|hente/i);
  const feedback=planFeedback({school,grade:'3',plan});
  if(['fetch_error','download_error','parse_error'].includes(kind)){
   assert.equal(feedback.hideContent,true);
   assert.equal(feedback.showRetry,true);
   assert.match(feedback.description,/ikke bekreftet at ukeplanen mangler/i);
  }
 }
});
test('Loading, network failure and AI states do not masquerade as missing PDF',()=>{
 assert.equal(planAvailability({loading:true}).kind,'loading');
 assert.equal(planAvailability({error:'HTTP 503'}).kind,'fetch_error');
 assert.equal(planAvailability({plan:{status:'partial',aiStatus:'processing'}}).kind,'analyzing');
 assert.equal(planAvailability({plan:{status:'partial',aiStatus:'failed'}}).kind,'analysis_failed');
 assert.equal(planAvailability({plan:{status:'partial',aiStatus:'ready'}}).kind,'partial');
 assert.equal(planAvailability({plan:{status:'ok',aiStatus:'ready'}}).kind,'ready');
 const p={status:'partial',aiStatus:'processing',year:2026,week:44};
 assert.match(profileSummary(profile,p,cal).reason,/AI-tolkingen pågår/);
});
