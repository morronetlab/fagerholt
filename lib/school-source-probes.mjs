/** Bounded, proactive official-grade-page probes. No AI request and no PDF
 * download: "pdf_found" means a valid link, not verified PDF content.
 * Other statuses from real /api/plan requests and background AI work are
 * recorded separately by the operations monitor.
 */
import {siteConfig} from '../public/site-config.mjs';
import {getSchool,validGradeCode,locateGradeSections,isSchoolSectionUrl} from './schools.mjs';
import {schoolCalendar} from './calendar.mjs';
import {findPdfLinks,choosePdf} from './plan-core.mjs';
import {recordOperationsObservation} from './operations-monitor.mjs';

const DEFAULT_TARGETS='fagerholt:3,fagerholt:7';
const MAX_TARGETS=12;
export function operationsTargets(value=DEFAULT_TARGETS){
 if(typeof value!=='string')return [];
 const unique=new Set();
 for(const input of value.split(',')){
  const [id,grade,...tail]=input.trim().split(':');
  if(tail.length||!getSchool(id)||!validGradeCode(grade))continue;
  unique.add(id+':'+grade);
  if(unique.size===MAX_TARGETS)break;
 }
 return [...unique].map(value=>{
  const [school,grade]=value.split(':');return{school,grade};
 });
}
const validHost=(value)=>{
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&!u.username&&!u.password&&
   siteConfig.allowedSourceHosts.includes(u.hostname);
 }catch{return false;}
};
async function safeHtml(url,fetchImpl){
 if(!validHost(url))throw Error('Unapproved school host');
 const res=await fetchImpl(url,{redirect:'follow',headers:{
  'User-Agent':'Skoleuka public source monitor',
  'Accept':'text/html','Accept-Language':'nb-NO,nb;q=0.9'
 },signal:AbortSignal.timeout(8000)});
 if(!res.ok||!validHost(res.url||url))throw Error('School source unavailable');
 if(Number(res.headers.get('content-length')||0)>1_000_000)throw Error('School HTML too large');
 const bytes=await res.arrayBuffer();
 if(bytes.byteLength>1_000_000)throw Error('School HTML too large');
 return new TextDecoder().decode(bytes);
}
export async function runSchoolSourceProbes({fetchImpl=fetch,env=process.env,
 now=()=>new Date(),record=recordOperationsObservation}={}){
 const targets=operationsTargets(env.OPS_MONITOR_TARGETS===undefined?
  DEFAULT_TARGETS:env.OPS_MONITOR_TARGETS);
 const discovery=new Map(),results=[];
 // Concurrency intentionally low to respect a school's public website and
 // Netlify scheduled-function execution window.
 for(let start=0;start<targets.length;start+=3){
  const batch=targets.slice(start,start+3);
  const observations=await Promise.all(batch.map(async target=>{
   const school=getSchool(target.school),date=now();
   const {year,week}=schoolCalendar(date,school.timezone);
   let kind='source_error';
   try{
    let source=school.grades?.[target.grade];
    if(!source){
     if(!discovery.has(school.id))
      discovery.set(school.id,locateGradeSections(school,url=>safeHtml(url,fetchImpl)));
     const sections=await discovery.get(school.id);
     source=sections[target.grade];
    }
    if(!source)kind='grade_missing';
    else if(!isSchoolSectionUrl(source,school,target.grade))kind='source_error';
    else{
     const html=await safeHtml(source,fetchImpl);
     kind=choosePdf(findPdfLinks(html,source,siteConfig.allowedSourceHosts),week)?
      'pdf_found':'unpublished';
    }
   }catch{kind='source_error';}
   const row={school:school.id,grade:target.grade,year,week,kind,origin:'probe'};
   await record(row,{env});
   return row;
  }));
  results.push(...observations);
 }
 console.info('ukeplan.school_source_monitor',JSON.stringify({
  targets:results.length,kinds:results.reduce((out,x)=>{
   out[x.kind]=(out[x.kind]||0)+1;return out;
  },{})
 }));
 return results;
}
