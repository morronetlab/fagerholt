/** Privacy-minimal public feedback intake for source-backed school plans.
 * The store is private Netlify Blobs, not user profiles or Supabase.
 */
import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {getSchool,validGradeCode} from './schools.mjs';
import {sourcePdfLink} from '../public/shared/practical-digest.mjs';

export const REPORT_KINDS=Object.freeze(['wrong_date','missing_notice','wrong_interpretation']);
const LIMIT_PER_DAY=5;
const safeText=value=>String(value||'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/gu,' ')
 .replace(/\s+/gu,' ').trim();
const hash=value=>createHash('sha256').update(value).digest('hex');
const hmac=(value,secret)=>createHmac('sha256',secret).update(value).digest('hex');
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'
}});
const bad=message=>json({error:message},400);
const looksPrivate=text=>/\b[\w.+%-]+@[\w.-]+\.[a-z]{2,}\b/iu.test(text)||
 /\b(?:\+47[\s-]*)?(?:\d[\s-]*){8,11}\b/u.test(text);
export function validateIssueReport(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 if(!REPORT_KINDS.includes(input.kind)||!getSchool(input.school)||
  !validGradeCode(input.grade)||!Number.isInteger(input.year)||
  input.year<2020||input.year>2100||!Number.isInteger(input.week)||
  input.week<1||input.week>53)return null;
 const details=safeText(input.details),sourceText=safeText(input.sourceText);
 if(typeof input.details!=='string'||typeof input.sourceText!=='string'||
  details.length>350||sourceText.length>450||looksPrivate(details))return null;
 if(input.kind==='missing_notice'&&details.length<12)return null;
 if(input.pdf!=null&&typeof input.pdf!=='string')return null;
 let pdf=null;
 if(input.pdf){
  // Original school PDFs are immutable source references here, never URLs
  // with arbitrary query parameters or fragments supplied by the browser.
  try{const url=new URL(input.pdf);
   if(url.search||url.hash)return null;
  }catch{return null;}
  pdf=sourcePdfLink(input.pdf);
  if(!pdf||pdf!==input.pdf)return null;
 }
 const sourcePage=input.sourcePage==null?null:input.sourcePage;
 if(sourcePage!==null&&(!Number.isInteger(sourcePage)||sourcePage<1||
  sourcePage>100||!pdf))return null;
 return {
  kind:input.kind,school:input.school,grade:input.grade,
  year:input.year,week:input.week,pdf,sourcePage,
  sourceText,details
 };
}
export async function openIssueStore(){
 const {getStore}=await import('@netlify/blobs');
 return getStore({name:'ukeplan-feedback',region:process.env.AI_BLOBS_REGION||'eu-central-1',
  consistency:'strong'});
}
export function createIssueReportHandler({storeFactory=openIssueStore,env=process.env,
 now=Date.now}={}){
 return async request=>{
  if(request.method!=='POST')return json({error:'Kun POST støttes'},405);
  const secret=env.FEEDBACK_HASH_SECRET||env.AI_JOB_SECRET;
  if(typeof secret!=='string'||secret.length<24)
   return json({error:'Rapportering er midlertidig utilgjengelig'},503);
  const contentType=request.headers.get('content-type')||'';
  if(!/^application\/json(?:\s*;|$)/iu.test(contentType))return json({error:'Forventet JSON'},415);
  const origin=request.headers.get('origin');
  if(origin){
   try{if(new URL(origin).origin!==new URL(request.url).origin)return json({error:'Ugyldig opphav'},403);}
   catch{return json({error:'Ugyldig opphav'},403);}
  }else if(request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Ugyldig opphav'},403);
  let raw;
  try{raw=await request.text();}catch{return bad('Kunne ikke lese rapporten');}
  if(raw.length>2200)return json({error:'Rapporten er for lang'},413);
  let input;try{input=JSON.parse(raw);}catch{return bad('Ugyldig JSON');}
  const report=validateIssueReport(input);
  if(!report)return bad('Kontroller skole, trinn og tekst. Ikke skriv e-post eller telefonnummer.');
  try{
   const store=await storeFactory();
   const today=new Date(now()).toISOString().slice(0,10);
   // Netlify injects this header. Never trust a user-supplied x-forwarded-for.
   // No raw IP, family ID, user agent or account email is persisted.
   const ip=request.headers.get('x-nf-client-connection-ip')||'unknown';
   const client=hmac(ip,secret).slice(0,24);
   const digest=hash(JSON.stringify(report)).slice(0,32);
   const dedup='dedup/'+today+'/'+client+'/'+digest;
   if(await store.get(dedup,{type:'json',consistency:'strong'}))
    return json({status:'received',duplicate:true});
   // Atomic slot claims provide a bounded 5/day allowance per hashed address.
   let allowed=false;
   for(let i=0;i<LIMIT_PER_DAY;i++){
    const slot=await store.setJSON('rate/'+today+'/'+client+'/'+i,
     {createdAt:new Date(now()).toISOString()},{onlyIfNew:true});
    if(slot?.modified===true){allowed=true;break;}
   }
   if(!allowed)return json({error:'For mange rapporter i dag. Prøv igjen i morgen.'},429);
   const id=randomUUID();
   await store.setJSON('reports/'+today+'/'+id+'.json',
    {id,submittedAt:new Date(now()).toISOString(),...report});
   await store.setJSON(dedup,{id});
   console.info('ukeplan.issue_report',JSON.stringify({
    id,kind:report.kind,school:report.school,grade:report.grade,
    year:report.year,week:report.week,sourcePage:report.sourcePage
   }));
   return json({status:'received'},201);
  }catch(error){
   console.error('Issue report storage unavailable:',String(error?.message||'unknown').slice(0,100));
   return json({error:'Kunne ikke lagre rapporten. Prøv igjen senere.'},503);
  }
 };
}
function authorized(request,token){
 const received=request.headers.get('authorization')||'';
 if(!token||token.length<24||!received.startsWith('Bearer '))return false;
 const a=hash(received.slice(7)),b=hash(token);
 return timingSafeEqual(Buffer.from(a),Buffer.from(b));
}
/** Read-only review endpoint. Disabled until FEEDBACK_ADMIN_TOKEN is set. */
export function createIssueReviewHandler({storeFactory=openIssueStore,env=process.env,
 now=Date.now}={}){
 return async request=>{
  if(request.method!=='GET')return json({error:'Kun GET støttes'},405);
  if(!authorized(request,env.FEEDBACK_ADMIN_TOKEN))return json({error:'Ingen tilgang'},401);
  const url=new URL(request.url);
  const date=url.searchParams.get('date')||new Date(now()).toISOString().slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(date)||!Number.isFinite(Date.parse(date)))
   return bad('Ugyldig dato');
  try{
   const store=await storeFactory();
   const reports=await store.list({prefix:'reports/'+date+'/'});
   const alerts=await store.list({prefix:'alerts/'+date+'/'});
   const load=async entries=>{
    const keys=(entries?.blobs||[]).map(entry=>entry.key).sort().slice(0,100);
    return (await Promise.all(keys.map(key=>store.get(key,{type:'json',consistency:'strong'}))))
     .filter(Boolean);
   };
   return json({date,reports:await load(reports),sourceAlerts:await load(alerts),
    note:'Private review; first 100 records of each category for the selected day'});
  }catch(error){
   console.error('Issue review unavailable:',String(error?.message||'unknown').slice(0,100));
   return json({error:'Kunne ikke lese rapportene'},503);
  }
 };
}
/** Save source discrepancies next to user-submitted issues, without PDF text or personal data. */
export async function recordSourceAlert({school,grade,year,week,hash:pdfHash,pdf,audit},
 {storeFactory=openIssueStore,now=Date.now}={}){
 if(audit?.status!=='attention'||!/^[a-f0-9]{64}$/.test(pdfHash))return false;
 const date=new Date(now()).toISOString().slice(0,10);
 const store=await storeFactory();
 await store.setJSON('alerts/'+date+'/'+school+'/'+grade+'/'+year+'-'+week+'-'+pdfHash.slice(0,20)+'.json',{
  recordedAt:new Date(now()).toISOString(),school,grade,year,week,
  pdf:sourcePdfLink(pdf),sourceFacts:audit.sourceFacts,missing:audit.missing,
  unsupported:audit.unsupported,status:'attention'
 });
 return true;
}
