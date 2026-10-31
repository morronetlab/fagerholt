// Diagnostic only: public school plans, never identities, tokens or source texts.
const origin='https://www.skoleuka.no';
for (const grade of ['3','7']) {
  try {
    const path='/api/plan?school=fagerholt&grade='+grade+'&nextWeek=1';
    const res=await fetch(origin+path,{signal:AbortSignal.timeout(45000),headers:{Accept:'application/json'}});
    const plan=await res.json();
    const short={grade,http:res.status,status:plan.status,parser:plan.parser,
      aiStatus:plan.aiStatus,year:plan.year,week:plan.week,hasPdf:Boolean(plan.pdf),
      audit:plan.sourceAudit&&{status:plan.sourceAudit.status,sourceFacts:plan.sourceAudit.sourceFacts,
       missing:plan.sourceAudit.missing,unsupported:plan.sourceAudit.unsupported},
      homeworkSourceVerified:plan.homeworkSourceVerified,
      homeworkCount:Array.isArray(plan.homework)?plan.homework.length:null,
      noticesCount:Array.isArray(plan.notices)?plan.notices.length:null,
      daysCount:plan.days&&typeof plan.days==='object'?Object.keys(plan.days).length:null,
      warningCode:plan.aiStatus==='failed'?'AI_FAILED':plan.status==='unpublished'?'PDF_UNPUBLISHED':null};
    console.log('DIGEST_DIAG',JSON.stringify(short));
  } catch (error) {
    console.log('DIGEST_DIAG',JSON.stringify({grade,error: String(error?.message||error).slice(0,120)}));
  }
}
