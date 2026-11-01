/** Private, aggregate operational observations. No accounts, device IDs,
 * source texts, PDF URLs or student data are stored or returned.
 */
import {createHash,timingSafeEqual} from 'node:crypto';
import {siteConfig} from '../public/site-config.mjs';
import {getSchool,validGradeCode} from './schools.mjs';
import {openHealthStore,HEALTH_KEY,healthSummary} from './calendar-monitor.mjs';
import {mailConfigured,sendPlainEmail} from './mail-core.mjs';

export const OPS_STORE_NAME='ukeplan-operations';
export const OPS_ALERT_THRESHOLD=3;
export const OPS_DEDUPE_MS=5*60_000;
const lastKey=(school,grade)=>'latest/'+school+'/'+grade+'.json';
const iso=at=>new Date(at).toISOString();
const knownGrades=/^[1-7](?:[A-Z])?$/;
const kinds=new Set(['pdf_found','unpublished','grade_missing','source_error',
 'pdf_download_failed','pdf_parse_failed','unreadable','ai_processing','ai_failed',
 'ai_ready','ready','partial']);
const troubled=new Set(['grade_missing','source_error','pdf_download_failed',
 'pdf_parse_failed','unreadable','ai_failed']);
const errorCodeKinds={
 source_lookup_failed:'grade_missing',school_page_failed:'source_error',
 pdf_download_failed:'pdf_download_failed',pdf_parse_failed:'pdf_parse_failed'
};
export async function openOperationsStore(){
 const {getStore}=await import('@netlify/blobs');
 return getStore({name:OPS_STORE_NAME,region:process.env.AI_BLOBS_REGION||'eu-central-1',
  consistency:'strong'});
}
export function operationKind(input){
 if(input?.kind&&kinds.has(input.kind))return input.kind;
 if(input?.status==='unpublished')return 'unpublished';
 if(input?.status==='unavailable')return 'grade_missing';
 if(input?.status==='error')return errorCodeKinds[input.errorCode]||'source_error';
 if(input?.aiStatus==='failed')return 'ai_failed';
 if(input?.aiStatus==='processing')return 'ai_processing';
 if(input?.status==='unreadable')return 'unreadable';
 if(input?.aiStatus==='ready')return 'ai_ready';
 if(input?.status==='partial')return 'partial';
 if(input?.status==='ok')return 'ready';
 return null;
}
export function opsAlertEnabled(env=process.env){
 return env.SOURCE_ALERT_ENABLED==='true'&&mailConfigured(env)&&
  typeof env.SOURCE_ALERT_EMAIL==='string'&&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.SOURCE_ALERT_EMAIL);
}
const validObservation=o=>o&&getSchool(o.school)&&validGradeCode(o.grade)&&
 Number.isInteger(o.year)&&o.year>=2020&&o.year<=2100&&
 Number.isInteger(o.week)&&o.week>=1&&o.week<=53&&
 kinds.has(o.kind);
const originLabel=origin=>origin==='probe'?'periodic_probe':
 origin==='ai_worker'?'ai_worker':'plan_api';
export function nextOperationsSnapshot(previous,observation,stamp){
 if(!validObservation(observation))throw Error('Invalid public school observation');
 const kind=observation.kind,failed=troubled.has(kind),at=iso(stamp);
 const same=previous?.status===kind,within=Number.isFinite(Date.parse(previous?.lastCheckedAt))&&
  stamp-Date.parse(previous.lastCheckedAt)<OPS_DEDUPE_MS;
 if(same&&within)return null; // traffic or status polling is not a new failure check
 const consecutiveFailures=failed?(previous?.lastFailureAt&&previous?.consecutiveFailures?
  previous.consecutiveFailures+1:1):0;
 const episode=failed?
  previous?.consecutiveFailures&&previous.lastFailureEpisodeAt?
   previous.lastFailureEpisodeAt:at:null;
 return {
  school:observation.school,grade:observation.grade,
  year:observation.year,week:observation.week,status:kind,
  origin:originLabel(observation.origin),
  lastCheckedAt:at,
  lastSourceOkAt:!['source_error','grade_missing'].includes(kind)?at:
   previous?.lastSourceOkAt||null,
  lastPdfFoundAt:!['unpublished','source_error','grade_missing'].includes(kind)?at:
   previous?.lastPdfFoundAt||null,
  lastPlanReadyAt:['ai_ready','ready'].includes(kind)?at:
   previous?.lastPlanReadyAt||null,
  lastAIReadyAt:kind==='ai_ready'?at:previous?.lastAIReadyAt||null,
  lastFailureAt:failed?at:previous?.lastFailureAt||null,
  lastFailureEpisodeAt:episode,
  consecutiveFailures,
  alertDelivered:failed&&Boolean(previous?.alertDelivered)&&previous?.lastFailureEpisodeAt===episode
 };
}
export async function recordOperationsObservation(observation,{
 storeFactory=openOperationsStore,env=process.env,now=Date.now,
 notify=sendPlainEmail}={}){
 // Fail closed on unrecognised/sensitive fields: only a fixed allowlist survives.
 const kind=operationKind(observation);
 const cleaned={
  school:String(observation?.school||''),grade:String(observation?.grade||''),
  year:observation?.year,week:observation?.week,
  kind,origin:observation?.origin
 };
 if(!validObservation(cleaned))return false;
 try{
  const store=await storeFactory(),stamp=now();
  const key=lastKey(cleaned.school,cleaned.grade);
  const previous=await store.get(key,{type:'json',consistency:'strong'});
  const next=nextOperationsSnapshot(previous,cleaned,stamp);
  if(!next)return true;
  if(troubled.has(next.status)&&next.consecutiveFailures>=OPS_ALERT_THRESHOLD&&
   !next.alertDelivered&&opsAlertEnabled(env)){
   // A durable claim prevents duplicate alerts from concurrent requests.
   const claim='alert-claims/'+cleaned.school+'/'+cleaned.grade+'/'+
    encodeURIComponent(next.lastFailureEpisodeAt);
   const result=await store.setJSON(claim,{createdAt:iso(stamp)},{onlyIfNew:true});
   if(result?.modified){
    try{
     await notify({to:env.SOURCE_ALERT_EMAIL,
      subject:'Skoleuka: gjentatte kildefeil ('+cleaned.school+', '+cleaned.grade+')',
      text:'Automatisk driftsvarsel fra Skoleuka.\nSkole: '+cleaned.school+
       '\nTrinn: '+cleaned.grade+'\nUke: '+cleaned.year+'-'+cleaned.week+
       '\nFeiltype: '+next.status+'\nPåfølgende kontroller: '+
       next.consecutiveFailures+'\nSist kontrollert: '+next.lastCheckedAt+
       '\nIngen barn, foresatte, innloggingsdata eller PDF-innhold er inkludert.',
      idempotencyKey:'ops-'+createHash('sha256').update(claim).digest('hex').slice(0,32)},
      {env});
     next.alertDelivered=true;
    }catch(error){
     try{await store.delete(claim);}catch{}
     console.warn('Operations alert delivery unavailable:',String(error?.message||'failed').slice(0,80));
    }
   }else next.alertDelivered=true;
  }
  await store.setJSON(key,next);
  return true;
 }catch(error){
  // Monitoring must NEVER prevent a child from seeing a real school plan.
  console.warn('Operations observation unavailable:',String(error?.message||'failed').slice(0,90));
  return false;
 }
}
export function authorizedOperations(request,env=process.env){
 const token=env.OPS_DASHBOARD_TOKEN||env.FEEDBACK_ADMIN_TOKEN;
 const header=request.headers.get('authorization')||'';
 if(typeof token!=='string'||token.length<24||!header.startsWith('Bearer '))return false;
 const hash=value=>createHash('sha256').update(value).digest();
 return timingSafeEqual(hash(header.slice(7)),hash(token));
}
async function listLatest(store){
 let cursor,items=[];
 for(let page=0;page<5;page++){
  const pageData=await store.list({prefix:'latest/',...(cursor?{cursor}:{})});
  items.push(...(pageData?.blobs||[]).map(item=>item.key));
  cursor=pageData?.cursor;
  if(!cursor||items.length>=500)break;
 }
 return (await Promise.all(items.slice(0,500).map(key=>store.get(key,{type:'json',
  consistency:'strong'})))).filter(row=>row&&validObservation({...row,kind:row.status}))
  .map(row=>({
   school:row.school,grade:row.grade,status:row.status,year:row.year,week:row.week,
   origin:row.origin,lastCheckedAt:row.lastCheckedAt,
   lastSourceOkAt:row.lastSourceOkAt,lastPdfFoundAt:row.lastPdfFoundAt,
   lastPlanReadyAt:row.lastPlanReadyAt,lastAIReadyAt:row.lastAIReadyAt,
   lastFailureAt:row.lastFailureAt,consecutiveFailures:row.consecutiveFailures,
   alertDelivered:row.alertDelivered===true
  }));
}
export async function operationsSummary({storeFactory=openOperationsStore,
 healthFactory=openHealthStore,env=process.env,now=Date.now}={}){
 const store=await storeFactory();
 const records=await listLatest(store);
 const today=now();
 const schools=Object.values(siteConfig.schools).map(school=>{
  const grades=records.filter(record=>record.school===school.id)
   .sort((a,b)=>a.grade.localeCompare(b.grade,'nb-NO'));
  return {id:school.id,name:school.name,
   status:!grades.length?'not_monitored':grades.some(g=>troubled.has(g.status))?
    'attention':grades.some(g=>g.status==='ai_processing')?'processing':'observed',
   grades};
 });
 let calendar=healthSummary(null,today);
 try{
  const sourceStore=await healthFactory(),state=await sourceStore.get(HEALTH_KEY,{
   type:'json',consistency:'strong'});
  calendar=healthSummary(state,today);
 }catch{}
 return {
  checkedAt:iso(today),
  alertConfigured:opsAlertEnabled(env),
  alertsAfterConsecutiveFailures:OPS_ALERT_THRESHOLD,
  totalSchools:schools.length,observedGrades:records.length,
  attentionGrades:records.filter(r=>troubled.has(r.status)).length,
  schools,calendar,
  note:'Kun offentlig kilde- og trinnstatus. Ikke brukernes identitet, familier eller PDF-innhold.'
 };
}
