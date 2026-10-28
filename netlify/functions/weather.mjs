import {siteConfig} from '../../public/site-config.mjs';
import {summarizeForecast} from '../../lib/weather-core.mjs';
import {getSchool} from '../../lib/schools.mjs';
const endpoint=(lat,lon)=>`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
const headers={'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};
const send=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...headers,'Cache-Control':status===200?'public, max-age=300, s-maxage=1800':'no-store'}});
const caches=new Map();
export default async function weather(request) {
  const schoolId=new URL(request.url).searchParams.get('school')||siteConfig.school.id;
  const school=getSchool(schoolId);
  if(!school)return send({status:'error',error:'Ukjent skole'},400);
  const weatherConfig=school.weather||siteConfig.weather;
  const {lat,lon}=weatherConfig;
  const key=`${lat},${lon}`;
  const state=caches.get(key)||{cache:null,expiresAt:0,lastModified:null};
  let {cache,expiresAt,lastModified}=state;
  if(!siteConfig.features.weather) return send({status:'disabled',days:{}},200);
  if(cache&&Date.now()<expiresAt) return send({...cache,locationLabel:weatherConfig.label});
  try {
    const h={'User-Agent':'Ukeplanen/0.1 (+https://github.com/morronetlab/fagerholt)','Accept':'application/json'};
    if(lastModified) h['If-Modified-Since']=lastModified;
    const response=await fetch(endpoint(lat,lon),{headers:h,signal:AbortSignal.timeout(10000)});
    if(response.status===304&&cache){expiresAt=Date.now()+600000;caches.set(key,{cache,expiresAt,lastModified});return send({...cache,locationLabel:weatherConfig.label});}
    if(!response.ok)throw new Error(`MET HTTP ${response.status}`);
    if(Number(response.headers.get('content-length'))>4_000_000)throw new Error('Værfil for stor');
    const payload=await response.json();
    const days=summarizeForecast(payload);
    if(!Object.keys(days).length) throw new Error('Ingen værdata');
    cache={source:siteConfig.weather.attribution,locationLabel:weatherConfig.label,updatedAt:payload?.properties?.meta?.updated_at??new Date().toISOString(),days};
    const upstreamExpiry=Date.parse(response.headers.get('expires')||'');
    expiresAt=Number.isFinite(upstreamExpiry)&&upstreamExpiry>Date.now()?upstreamExpiry:Date.now()+600000;
    lastModified=response.headers.get('last-modified');
    caches.set(key,{cache,expiresAt,lastModified});
    return send(cache);
  }catch(error){
    console.error('Weather request failed:',error);
    if(cache) return send({...cache,locationLabel:weatherConfig.label,stale:true,warning:'Viser sist lagrede værmelding.'});
    return send({status:'error',warning:'Værmelding midlertidig utilgjengelig.',days:{}},502);
  }
}
