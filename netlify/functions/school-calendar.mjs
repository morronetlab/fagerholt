/** Read-only public municipal school calendar; no student data or AI calls. */
import {getSchool} from '../../lib/schools.mjs';
import {dayDate} from '../../public/shared/calendar.mjs';
import {SKOLERUTE_URL,parseMunicipalYearHtml,municipalDatesForYear,officialSnapshot}
 from '../../lib/kristiansand-calendar.mjs';
import {inspectOfficialHtml} from '../../lib/calendar-monitor.mjs';

const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{
 'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':status===200?'public, max-age=300, s-maxage=3600':'no-store',
 'X-Content-Type-Options':'nosniff'
}});
const yearBetween=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
let cache=null;
const dateText=date=>date.toISOString().slice(0,10);
function getNextSchoolStart(rows,year){
 const august=(rows||[]).find(row=>String(row[0]).toLowerCase()==='august'&&
  /skolestart/iu.test(row[2]));
 const day=august&&Number(String(august[1]).match(/\d{1,2}/u)?.[0]);
 return day>=1&&day<=31?String(year)+'-08-'+String(day).padStart(2,'0'):null;
}
export function createSchoolCalendarHandler({fetchImpl=fetch,now=()=>new Date(),
 sourceUrl=SKOLERUTE_URL}={}){
 async function readPublicHtml(){
  const at=now().getTime();
  if(cache&&cache.fetchImpl===fetchImpl&&cache.sourceUrl===sourceUrl&&
    cache.expires>at)return cache.html;
  let html=null;
  try{
   const res=await fetchImpl(sourceUrl,{headers:{
    Accept:'text/html','User-Agent':'Skoleuka public calendar (https://skoleuka.no)'
   },signal:AbortSignal.timeout(8500)});
   if(!res.ok)throw Error('Municipal source HTTP '+res.status);
   const size=Number(res.headers.get('content-length')||0);
   if(size>2_000_000)throw Error('Municipal source too large');
   html=await res.text();
   if(html.length>2_000_000)throw Error('Municipal source too large');
  }catch(error){
   console.warn('Municipal calendar source unavailable:',String(error?.message||'fetch').slice(0,90));
  }
  cache={html,fetchImpl,sourceUrl,expires:at+(html?60*60*1000:5*60*1000)};
  return html;
 }
 return async request=>{
  if(request.method!=='GET')return reply({error:'Kun GET støttes'},405);
  const q=new URL(request.url).searchParams;
  const school=getSchool(q.get('school'));
  const year=Number(q.get('year')),week=Number(q.get('week'));
  if(!school||!yearBetween(year,2026,2032)||!yearBetween(week,1,53)||
    String(year)!==q.get('year')||String(week)!==q.get('week'))
   return reply({error:'Ugyldig skole eller uke'},400);
  const first=dayDate(year,week,0),last=dayDate(year,week,4);
  if(new Date(first+'T00:00:00Z').getUTCFullYear()===2026&&
    Number(new Date(first+'T00:00:00Z').getUTCDay())===0)
   return reply({error:'Ugyldig uke'},400);
  const html=await readPublicHtml();
  const years=[year-1,year];
  const events=new Map(),modes=[],verifiedDates=[];
  for(const startYear of years){
   let data=html?parseMunicipalYearHtml(html,startYear):null;
   // Freeze disputed critical dates on last audited municipality snapshot
   // instead of passing a valid-looking but unreviewed HTML change to parents.
   if(data&&startYear===2026&&!inspectOfficialHtml(html,startYear).valid)data=null;
   if(!data)data=officialSnapshot(startYear);
   if(!data)continue;
   const following=html?parseMunicipalYearHtml(html,startYear+1):null;
   const firstDay=getNextSchoolStart(following?.rows,startYear+1);
   data={...data,sfo:data.sfo?{...data.sfo,nextSchoolStart:firstDay}:null};
   const dates=municipalDatesForYear(data,startYear);
   modes.push(data.origin);
   if(data.verifiedAt)verifiedDates.push(data.verifiedAt);
   for(const event of dates){
    if(event.date<first||event.date>last)continue;
    const current=events.get(event.date);
    // A later authoritative live record can only strengthen a closure,
    // never convert "SFO unknown" into "SFO open".
    events.set(event.date,current?{
     ...current,schoolFree:current.schoolFree||event.schoolFree,
     sfoClosed:current.sfoClosed||event.sfoClosed,
     sfoStatus:current.sfoClosed||event.sfoClosed?'closed':'unknown',
     label:current.schoolFree?current.label:event.label
    }:event);
   }
  }
  const active=mode=>modes.includes(mode);
  const sourceStatus=active('snapshot')?'snapshot':active('live')?'live':'unavailable';
  return reply({schoolId:school.id,year,week,sourceUrl,
   sourceStatus,checkedAt:sourceStatus==='live'?dateText(now()):verifiedDates[0]||null,
   scope:'municipal_default',localChangesPossible:true,
   schoolUrl:school.homepage,
   // SFO "unknown" never means "open". Explicit closure comes from municipality.
   events:[...events.values()].sort((a,b)=>a.date.localeCompare(b.date))
  });
 };
}
export default createSchoolCalendarHandler();
