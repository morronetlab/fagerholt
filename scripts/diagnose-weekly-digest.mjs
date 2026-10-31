// Diagnostic only: public school plans, never identities, tokens or source texts.
import {pdfPages} from '../netlify/functions/plan.mjs';
import {auditPracticalSource} from '../lib/practical-source-audit.mjs';
import {findPdfLinks} from '../lib/plan-core.mjs';
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
    if(grade==='3' && plan.pdf && !plan.sourceAudit) {
      const pdfRes=await fetch(plan.pdf,{signal:AbortSignal.timeout(20000)});
      if(pdfRes.ok){
        const pages=await pdfPages(new Uint8Array(await pdfRes.arrayBuffer()));
        const audit=auditPracticalSource(plan,pages.map(p=>p.items.map(i=>i.text).join(' ')));
        console.log('DIGEST_AUDIT',JSON.stringify({grade,afterBackfill:audit}));
      }
    }
    if(grade==='7'&&plan.status==='unpublished'&&plan.source){
      const res=await fetch(plan.source,{signal:AbortSignal.timeout(20000)});
      const html=await res.text();
      const candidates=findPdfLinks(html,plan.source);
      console.log('DIGEST_PDF_DISCOVERY',JSON.stringify({grade,http:res.status,pdfWeeks:[...new Set(candidates.map(p=>p.week))].sort((a,b)=>a-b),
        week45Mentioned:/uke[\\s._-]*45/i.test(html)}));
    }
  } catch (error) {
    console.log('DIGEST_DIAG',JSON.stringify({grade,error: String(error?.message||error).slice(0,120)}));
  }
}
