/** Targeted CI diagnostic; reports counts only, never school text or student data. */
import {pdfPages} from '../netlify/functions/plan.mjs';
import {verifyPracticalDigestHighlights} from '../lib/digest-practical-evidence.mjs';
import {profileSummary} from '../public/shared/family-core.mjs';
import {practicalHighlights} from '../public/shared/practical-highlights.mjs';
import {adultImpactType} from '../public/shared/adult-impact.mjs';
import {dayDate} from '../public/shared/calendar.mjs';
const res=await fetch('https://www.skoleuka.no/api/plan?school=fagerholt&grade=3&nextWeek=1',{signal:AbortSignal.timeout(18000)});
if(!res.ok)throw Error('Live plan returned '+res.status);
const plan=await res.json();
if(plan.status!=='ok'||!plan.pdf)throw Error('Live school plan not ready');
const pdfRes=await fetch(plan.pdf,{signal:AbortSignal.timeout(25000)});
if(!pdfRes.ok)throw Error('Original PDF unavailable');
const pages=await pdfPages(new Uint8Array(await pdfRes.arrayBuffer()));
const profile={id:'diagnostic-class',name:'',school:'fagerholt',grade:'3',group:''};
const calendar={year:plan.year,week:plan.week,today:dayDate(plan.year,plan.week,0),upcoming:true};
const summary=profileSummary(profile,plan,calendar);
const candidates=practicalHighlights({profiles:[profile],
 summaries:new Map([[profile.id,summary]]),plans:new Map([[profile.id,plan]]),calendar,focus:'week'});
const validated=verifyPracticalDigestHighlights(plan,pages);
const count=(arr)=>({all:arr.length,
 workday:arr.filter(x=>adultImpactType(x.label)==='workday').length,
 health:arr.filter(x=>adultImpactType(x.label)==='health').length,
 gear:arr.filter(x=>x.kind==='gear').length,
 events:arr.filter(x=>x.kind==='event').length,
 notices:arr.filter(x=>x.kind==='notice').length});
console.log('DIGEST_PRACTICAL_PARITY',JSON.stringify({
 year:plan.year,week:plan.week,planStatus:plan.status,
 auditStatus:plan.sourceAudit?.status||'missing',
 fromWebsite:count(candidates),verifiedForEmail:count(validated)
}));
