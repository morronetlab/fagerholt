/** Refresh legacy cached AI results against the original already-downloaded PDF.
 * Does not invoke the model, add source facts, or mark an unverified PDF as safe.
 */
import {reconcileHomeworkWithPdf,HOMEWORK_SOURCE_VERSION} from './homework-source-truth.mjs';
import {auditPracticalSource} from './practical-source-audit.mjs';
import {markVerifiedHomework} from './homework-email-evidence.mjs';
import {DIGEST_PRACTICAL_EVIDENCE_VERSION,verifyPracticalDigestHighlights} from './digest-practical-evidence.mjs';

const auditStates=new Set(['ok','attention','unverified']);
export function needsCachedEvidenceRefresh(plan){
 return !!plan&&(plan.digestPracticalEvidenceVersion!==DIGEST_PRACTICAL_EVIDENCE_VERSION ||
   plan.homeworkSourceVersion!==HOMEWORK_SOURCE_VERSION ||
   !auditStates.has(plan.sourceAudit?.status) ||
   plan.sourceAudit?.status==='attention'&&Array.isArray(plan.homework)&&
     plan.homework.some(x=>typeof x.digestSourceVerified!=='boolean'));
}
export function refreshCachedEvidence(plan,pages){
 if(!needsCachedEvidenceRefresh(plan)||!Array.isArray(pages)||!pages.length)
  return {plan,changed:false};
 const next={...plan};
 if(next.homeworkSourceVersion!==HOMEWORK_SOURCE_VERSION){
  const checked=reconcileHomeworkWithPdf(next.homework,pages);
  next.homework=checked.homework;
  next.homeworkSourceVerified=checked.verified;
  next.homeworkSourceVersion=HOMEWORK_SOURCE_VERSION;
 }
 // Rebuild item-level evidence once when upgrading legacy caches.
 if(!Array.isArray(next.homework)||next.homework.some(x=>x.digestSourceVerified!==true&&x.digestSourceVerified!==false))
  next.homework=markVerifiedHomework(next,pages);
 if(next.digestPracticalEvidenceVersion!==DIGEST_PRACTICAL_EVIDENCE_VERSION){
  next.digestPracticalHighlights=verifyPracticalDigestHighlights(next,pages);
  next.digestPracticalEvidenceVersion=DIGEST_PRACTICAL_EVIDENCE_VERSION;
 }
 if(!auditStates.has(next.sourceAudit?.status)){
  const text=pages.map(p=>(p.items||[]).map(i=>i.text).join(' '));
  next.sourceAudit=auditPracticalSource(next,text);
 }
 return {plan:next,changed:true};
}
