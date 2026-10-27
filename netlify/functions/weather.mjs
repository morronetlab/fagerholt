import {siteConfig} from '../../public/site-config.mjs';
import {summarizeForecast} from '../../lib/weather-core.mjs';
const {lat,lon}=siteConfig.weather;
const endpoint=`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
const headers={'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};
const send=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...headers,'Cache-Control':status===200?'public, max-age=300, s-maxage=1800':'no-store'}});
let cache=null;
let expiresAt=0;
let lastModified=null;
export default async function weather() {
  if(!siteConfig.features.weather) return send({status:'disabled',days:{}},200);
  if(cache&&Date.now()<expiresAt) return send(cache);
  try {
    const h={'User-Agent':'Ukeplanen/0.1 (+https://github.com/morronetlab/fagerholt)','Accept':'application/json'};
    if(lastModified) h['If-Modified-Since']=lastModified;
    const response=await fetch(endpoint,{headers:h,signal:AbortSignal.timeout(10000)});
    if(response.status===304&&cache){expiresAt=Date.now()+600000;return send(cache);}
    if(!response.ok)throw new Error(`MET HTTP ${response.status}`);
    if(Number(response.headers.get('content-length'))>4_000_000)throw new Error('Værfil for stor');
    const payload=await response.json();
    const days=summarizeForecast(payload);
    if(!Object.keys(days).length) throw new Error('Ingen værdata');
    cache={source:siteConfig.weather.attribution,updatedAt:payload?.properties?.meta?.updated_at??new Date().toISOString(),days};
    const upstreamExpiry=Date.parse(response.headers.get('expires')||'');
    expiresAt=Number.isFinite(upstreamExpiry)&&upstreamExpiry>Date.now()?upstreamExpiry:Date.now()+600000;
    lastModified=response.headers.get('last-modified');
    return send(cache);
  }catch(error){
    console.error('Weather request failed:',error);
    if(cache) return send({...cache,stale:true,warning:'Viser sist lagrede værmelding.'});
    return send({status:'error',warning:'Værmelding midlertidig utilgjengelig.',days:{}},502);
  }
}
