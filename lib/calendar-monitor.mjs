/** Automated, accountable freshness check of Kristiansand's municipal source.
 * Only official public dates and aggregate status are persisted. No user data.
 */
import {createHash} from 'node:crypto';
import {SKOLERUTE_URL,parseMunicipalYearHtml,municipalDatesForYear,
 officialSnapshot} from './kristiansand-calendar.mjs';
import {mailConfigured,sendPlainEmail} from './mail-core.mjs';

export const HEALTH_KEY='calendar-health/status-v1.json';
export const STALE_AFTER_MS=36*60*60*1000;
export async function openHealthStore(){
 const {getStore}=await import('@netlify/blobs');
 return getStore({name:'ukeplan-source-monitor',
  region:process.env.AI_BLOBS_REGION||'eu-central-1',consistency:'strong'});
}
const iso=stamp=>new Date(stamp).toISOString();
const digest=x=>createHash('sha256').update(x).digest('hex');
export const currentSchoolYear=date=>{
 const d=new Date(date);
 return d.getUTCFullYear()-(d.getUTCMonth()<7?1:0);
};
const critical=dates=>Object.fromEntries(['2026-11-06','2026-12-24','2027-05-07']
 .map(day=>{const x=dates.find(d=>d.date===day);
 return [day,x?{schoolFree:x.schoolFree,sfoClosed:x.sfoClosed}:null];}));
export function inspectOfficialHtml(html,startYear){
 const current=parseMunicipalYearHtml(html,startYear);
 if(!current)return {valid:false,reason:'Unrecognized municipal school-year table'};
 if(current.rows.length<8||!current.sfo)
  return {valid:false,reason:'Missing dates or explicit SFO source'};
 const reference=officialSnapshot(startYear);
 if(reference){
  const actual=critical(municipalDatesForYear(current,startYear));
  const expected=critical(municipalDatesForYear(reference,startYear));
  const anomalies=Object.keys(expected).filter(key=>JSON.stringify(actual[key])!==JSON.stringify(expected[key]));
  if(anomalies.length)return {valid:false,reason:'Changed critical source facts',
   changedDates:anomalies};
 }
 const fingerprint=digest(JSON.stringify({rows:current.rows,sfo:current.sfo}));
 return {valid:true,sourceYear:startYear,fingerprint,rows:current.rows.length,
  sfoVerified:true};
}
export function healthSummary(state,now=Date.now()){
 const checked=Date.parse(state?.lastCheckedAt||''),verified=Date.parse(state?.lastVerifiedAt||'');
 const stale=!Number.isFinite(verified)||now-verified>STALE_AFTER_MS;
 const status=state?.status||'not_monitored';
 return {status,stale,
  lastCheckedAt:Number.isFinite(checked)?state.lastCheckedAt:null,
  lastVerifiedAt:Number.isFinite(verified)?state.lastVerifiedAt:null,
  nextAction:stale?'Kontroller kommunens skolerute direkte.':'Ingen tiltak nødvendig.',
  sourceUrl:SKOLERUTE_URL,sourceYear:state?.sourceYear||null,
  changedDates:Array.isArray(state?.changedDates)?state.changedDates:[],
  alertDelivered:state?.alertDelivered===true};
}
export async function runCalendarMonitor({fetchImpl=fetch,storeFactory=openHealthStore,
 now=()=>new Date(),env=process.env,notify=sendPlainEmail}={}){
 const store=await storeFactory(),at=now(),old=await store.get(HEALTH_KEY,{type:'json',consistency:'strong'});
 const sourceYear=currentSchoolYear(at);
 let status='verified',reason='',fingerprint=null,rows=0,changedDates=[];
 try{
  const response=await fetchImpl(SKOLERUTE_URL,{headers:{Accept:'text/html'},
   signal:AbortSignal.timeout(9000)});
  if(!response.ok)throw Error('HTTP '+response.status);
  const size=Number(response.headers.get('content-length')||0);
  if(size>2_000_000)throw Error('Source too large');
  const html=await response.text();
  if(html.length>2_000_000)throw Error('Source too large');
  const evidence=inspectOfficialHtml(html,sourceYear);
  if(!evidence.valid){
   status=evidence.changedDates?'changed':'unverifiable';
   reason=evidence.reason;
   changedDates=evidence.changedDates||[];
  }else{
   rows=evidence.rows;fingerprint=evidence.fingerprint;
  }
 }catch(error){status='unavailable';reason=String(error?.message||'Source not reachable').slice(0,120);}
 const state={schema:1,status,sourceUrl:SKOLERUTE_URL,sourceYear,
  lastCheckedAt:iso(at),lastVerifiedAt:status==='verified'?iso(at):old?.lastVerifiedAt||null,
  fingerprint:status==='verified'?fingerprint:old?.fingerprint||null,
  rowCount:status==='verified'?rows:old?.rowCount||0,
  changedDates,reason,consecutiveFailures:status==='verified'?0:(old?.consecutiveFailures||0)+1,
  alertDelivered:old?.alertDelivered===true&&old?.status===status,
  alertAttemptAt:null};
 // Deduplicated operational alert per failure episode, only with explicit mail configuration.
 const alertOn=env.SOURCE_ALERT_ENABLED==='true'&&mailConfigured(env)&&
  typeof env.SOURCE_ALERT_EMAIL==='string'&&env.SOURCE_ALERT_EMAIL.includes('@');
 if(status!=='verified'&&alertOn&&!state.alertDelivered){
  state.alertAttemptAt=iso(at);
  try{
   await notify({to:env.SOURCE_ALERT_EMAIL,subject:'Skoleuka: skolerutekilden trenger kontroll',
    text:'Automatisk kildekontroll: '+status+'.\n'+reason+
     '\nSjekk '+SKOLERUTE_URL+'\nSist verifisert: '+(state.lastVerifiedAt||'aldri')+
     '\nIngen foreldreinformasjon er inkludert.',
    idempotencyKey:'calendar-alert-'+sourceYear+'-'+status+'-'+
     (old?.lastVerifiedAt||'never').slice(0,10).replace(/[^0-9-]/g,'')},
    {env,fetchImpl});
   state.alertDelivered=true;
  }catch(error){console.warn('calendar alert failed',String(error?.message||'delivery').slice(0,90));}
 }
 if(status==='verified')state.alertDelivered=false;
 await store.setJSON(HEALTH_KEY,state);
 console.info('ukeplan.calendar_monitor',JSON.stringify({status,sourceYear,rows,changedDates,
  consecutiveFailures:state.consecutiveFailures,alertDelivered:state.alertDelivered}));
 return healthSummary(state,at.getTime());
}
