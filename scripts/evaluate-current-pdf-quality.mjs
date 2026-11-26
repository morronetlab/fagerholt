/** Live quality smoke test: discover this ISO week's official PDF afresh.
 * Do not apply historical hand-reviewed goldens to a different document.
 * Only aggregate counts and fingerprints leave the process.
 */
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {officialFetch} from './collect-quality-originals.mjs';
import {schoolCalendar,DAYS} from '../lib/calendar.mjs';
import {getSchool,locateGradeSections,isSchoolSectionUrl} from '../lib/schools.mjs';
import {siteConfig} from '../public/site-config.mjs';
import {findPdfLinks,choosePdf,analyzePdfPages} from '../lib/plan-core.mjs';
import {extractSchoolClosuresFromPdf} from '../lib/school-closure-source.mjs';
import {pdfPages} from '../netlify/functions/plan.mjs';

export const CURRENT_TARGETS=Object.freeze([
 {school:'sjostrand',grade:'2'},{school:'fagerholt',grade:'4'},
 {school:'lovisenlund',grade:'4'},{school:'nygaard',grade:'4'}
]);

export function checkCurrentPlan(plan,pages,{grade,year,week,pdf,source}){
 const errors=[];
 if(plan?.grade!==grade||plan?.year!==year||plan?.week!==week||plan?.pdf!==pdf||plan?.source!==source)
  errors.push('Plan identity differs from requested official source');
 if(plan?.parsedFromPdf!==true||!['ok','partial'].includes(plan?.status))
  errors.push('Text-bearing PDF did not produce a usable rules plan');
 if(!Array.isArray(plan?.homework)||!Array.isArray(plan?.notices))
  errors.push('Missing homework or notices collection');
 for(const task of plan?.homework||[]){
  if(task.dueDay!=null&&!DAYS.includes(task.dueDay))errors.push('Invalid homework weekday');
  if(task.repeatDays!=null&&(!Array.isArray(task.repeatDays)||task.repeatDays.some(d=>!DAYS.includes(d))))
   errors.push('Invalid repeated homework weekday');
 }
 const evidence=extractSchoolClosuresFromPdf(pages,year,week);
 const closed=new Set(evidence.flatMap(item=>item.closedDays));
 for(const day of DAYS){
  const value=plan?.days?.[day];
  if(!Array.isArray(value?.events)||!Array.isArray(value?.bring)){errors.push('Missing day collections');continue;}
  if(Boolean(value.closed)!==closed.has(day))errors.push('Closure differs from current-week PDF evidence');
  if(value.closed&&(value.events.length||value.bring.length))errors.push('Closed day contains school events or packing');
 }
 for(const item of evidence){
  if(!(plan?.notices||[]).includes(item.noticeText))errors.push('Source-backed closure notice missing');
 }
 return [...new Set(errors)];
}

export async function evaluateCurrentPdfs({targets=CURRENT_TARGETS,now=new Date(),fetchImpl=fetch,
 extractPdf=pdfPages,parsePlan=analyzePdfPages}={}){
 const {year,week}=schoolCalendar(now,'Europe/Oslo');
 const cases=[];
 const load=async url=>new TextDecoder().decode(await officialFetch(url,{fetchImpl}));
 for(const target of targets){
  const school=getSchool(target.school);
  if(!school){cases.push({...target,status:'error',errors:['Unknown school']});continue;}
  let sections;
  try{sections=await locateGradeSections(school,load);}
  catch{cases.push({...target,status:'error',errors:['Grade discovery failed']});continue;}
  const grades=sections[target.grade]?[target.grade]:Object.keys(sections)
   .filter(g=>g.length===2&&g.startsWith(target.grade)).sort();
  if(!grades.length){cases.push({...target,status:'error',errors:['Requested grade not discovered']});continue;}
  for(const grade of grades){
   const row={school:school.id,grade,year,week,status:'error',errors:[]};
   try{
    const source=sections[grade];
    if(!isSchoolSectionUrl(source,school,grade))throw Error('Invalid school section');
    const links=findPdfLinks(await load(source),source,siteConfig.allowedSourceHosts);
    const selected=choosePdf(links,week);
    if(!selected){row.status='unpublished';cases.push(row);continue;}
    // Reject an explicitly dated link from a different year if it exists.
    // Ordinary undated current-week labels remain supported.
    const years=[...String(selected.label).matchAll(/\b(20\d{2})\b/g)].map(m=>Number(m[1]));
    if(years.length&&!years.includes(year)){row.status='unpublished';cases.push(row);continue;}
    const bytes=await officialFetch(selected.url,{fetchImpl,pdf:true});
    row.sha256=createHash('sha256').update(bytes).digest('hex');
    const pages=await extractPdf(bytes.slice());
    row.pages=pages.length;
    row.textTokens=pages.reduce((n,p)=>n+(p.items?.length||0),0);
    if(!pages.length)throw Error('PDF has no pages');
    if(!row.textTokens){row.status='no-text-layer';cases.push(row);continue;}
    const plan=parsePlan(pages,grade,selected.url,week,year,source);
    row.errors=checkCurrentPlan(plan,pages,{grade,year,week,pdf:selected.url,source});
    row.status=row.errors.length?'error':'verified';
    row.parserStatus=plan?.status||'unknown';
   }catch(e){
    // Do not log document content, raw URLs or exception text.
    row.errors=[/^Official school HTTP \d+$/.test(e?.message||'')?e.message:'Official source or parser failed'];
   }
   cases.push(row);
  }
 }
 const verified=cases.filter(c=>c.status==='verified').length;
 const errors=cases.filter(c=>c.status==='error').length;
 return {year,week,engine:'current-pdf-rules-smoke',liveModelCalls:0,verified,errors,
  unpublished:cases.filter(c=>c.status==='unpublished').length,
  noTextLayer:cases.filter(c=>c.status==='no-text-layer').length,
  passed:verified>0&&errors===0,cases};
}
export function currentReportMarkdown(r){
 return ['# Current official school PDF smoke test','',
  'ISO year/week: '+r.year+'/'+r.week,
  'Verified: '+r.verified+'; unpublished: '+r.unpublished+'; no text layer: '+r.noTextLayer+'; errors: '+r.errors,
  'Result: '+(r.passed?'PASS':'FAIL'),
  '', '| School | Grade | Source / parser result |', '| --- | --- | --- |',
  ...r.cases.map(c=>'| '+c.school+' | '+c.grade+' | '+c.status+(c.errors?.length?' – '+c.errors.join('; '):'')+' |'),
  '', 'Structural and source-evidence smoke checks only; not human-reviewed semantic accuracy or live AI accuracy.',
  'No original PDF bytes, raw text, contact details or family data retained.',''].join('\n');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const report=await evaluateCurrentPdfs();
 const dir=resolve(process.argv[2]||'quality-real-results');
 mkdirSync(dir,{recursive:true});
 writeFileSync(join(dir,'current-pdf-quality.json'),JSON.stringify(report,null,2)+'\n');
 const markdown=currentReportMarkdown(report);
 writeFileSync(join(dir,'current-pdf-quality.md'),markdown);
 console.log(markdown);
 if(!report.passed)process.exitCode=1;
}
