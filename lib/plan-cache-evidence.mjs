/** Refresh legacy cached AI results against the original already-downloaded PDF.
 * Does not invoke the model, add source facts, or mark an unverified PDF as safe.
 */
import {reconcileHomeworkWithPdf,HOMEWORK_SOURCE_VERSION} from './homework-source-truth.mjs';
import {auditPracticalSource} from './practical-source-audit.mjs';
import {markVerifiedHomework} from './homework-email-evidence.mjs';
import {withoutContactFooter} from './homework-contact-boundary.mjs';
import {extractExplicitSchoolPacking} from './packing-source.mjs';
import {DIGEST_PRACTICAL_EVIDENCE_VERSION,verifyPracticalDigestHighlights} from './digest-practical-evidence.mjs';

const auditStates=new Set(['ok','attention','unverified']);
// One-off recheck of already cached grade-2 Wilds Minne results, using the
// same official PDF bytes downloaded by /api/plan; no AI run or guessed days.
const FEEDBACK_SOURCE_REPAIR_VERSION=1;
const needsDayColumnRefresh=plan=>plan?.schoolId==='wildsminne'&&
 String(plan.grade)==='2'&&plan.homeworkDayColumnsVersion!==1;
export function needsCachedEvidenceRefresh(plan){
 return !!plan&&(plan.feedbackSourceRepairVersion!==FEEDBACK_SOURCE_REPAIR_VERSION||needsDayColumnRefresh(plan) ||
  plan.digestPracticalEvidenceVersion!==DIGEST_PRACTICAL_EVIDENCE_VERSION ||
   plan.homeworkSourceVersion!==HOMEWORK_SOURCE_VERSION ||
   !auditStates.has(plan.sourceAudit?.status) ||
   plan.sourceAudit?.status==='attention'&&Array.isArray(plan.homework)&&
     plan.homework.some(x=>typeof x.digestSourceVerified!=='boolean'));
}
export function refreshCachedEvidence(plan,pages){
 if(!needsCachedEvidenceRefresh(plan)||!Array.isArray(pages)||!pages.length)
  return {plan,changed:false};
 const next={...plan};
 if(needsDayColumnRefresh(plan)){
  const checked=reconcileHomeworkWithPdf(next.homework,pages);
  if(checked.verified){
   next.homework=checked.homework;
   next.homeworkSourceVerified=true;
  }
  // Records completion of the source inspection, not a claim that a
  // timetable is a homework matrix.
  next.homeworkDayColumnsVersion=1;
 }
 if(next.homeworkSourceVersion!==HOMEWORK_SOURCE_VERSION){
  const checked=reconcileHomeworkWithPdf(next.homework,pages);
  next.homework=checked.homework;
  next.homeworkSourceVerified=checked.verified;
  next.homeworkSourceVersion=HOMEWORK_SOURCE_VERSION;
 }
 if(next.feedbackSourceRepairVersion!==FEEDBACK_SOURCE_REPAIR_VERSION){
  // A previously cached AI description may contain a PDF footer or an old
  // weekday inference. Reconcile with the already-downloaded original, not
  // the browser's user-supplied interpretation or a new AI response.
  const cleaned=(Array.isArray(next.homework)?next.homework:[]).map(task=>({
   ...task,text:withoutContactFooter(task.text)
  })).filter(task=>task.text);
  const authoritative=reconcileHomeworkWithPdf(cleaned,pages);
  next.homework=authoritative.homework;
  if(authoritative.verified){
   next.homeworkSourceVerified=true;
   next.homeworkSourceVersion=HOMEWORK_SOURCE_VERSION;
  }
  const rows=extractExplicitSchoolPacking(pages);
  if(rows.length&&next.days&&typeof next.days==='object'){
   const days={...next.days};
   for(const item of rows){
    const day=days[item.day];
    if(!day||!Array.isArray(day.bring))continue;
    if(day===next.days[item.day])days[item.day]={...day,bring:day.bring.map(x=>({...x}))};
    const bring=days[item.day].bring;
    const simple=label=>String(label||'').replace(/\\s*\\(valgfritt\\)$/iu,'').toLocaleLowerCase('nb-NO');
    const existing=bring.find(x=>simple(x.label)===simple(item.label));
    if(existing){
     if(item.label.endsWith('(valgfritt)'))existing.label=item.label;
    }else bring.push({label:item.label});
   }
   next.days=days;
  }
  next.feedbackSourceRepairVersion=FEEDBACK_SOURCE_REPAIR_VERSION;
  next.homework=markVerifiedHomework(next,pages);
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
