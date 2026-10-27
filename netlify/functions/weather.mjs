import {summarizeForecast,FORECAST_LOCATION,PENT_LINK} from '../../lib/weather-core.mjs';

const FORECAST_URL = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${FORECAST_LOCATION.lat}&lon=${FORECAST_LOCATION.lon}`;
// MET requires a descriptive User-Agent and responsible caching; no scraping of Pent.no.
const USER_AGENT = 'Ukeplanen/1.0 (https://github.com/morronetlab/fagerholt)';
let saved = null;
let expiresAt = 0;
let lastModified = null;
let pending = null;
const reply = (data, code=200, maxAge=1800) => new Response(JSON.stringify(data), {
  status:code,
  headers:{'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':code===200?`public, max-age=300, s-maxage=${maxAge}, stale-while-revalidate=600`:'no-store',
    'X-Content-Type-Options':'nosniff'}
});
function computeExpiry(response,now) {
  const serverExpiry = Date.parse(response.headers.get('expires')||'');
  // The API's Expires header is authoritative; minimum 10min cache if omitted.
  return Number.isFinite(serverExpiry) && serverExpiry>now ? serverExpiry : now + 600_000;
}
async function fetchWeather() {
  const now=Date.now();
  if (saved && now < expiresAt) return saved;
  const headers={'User-Agent':USER_AGENT,'Accept':'application/json'};
  if (lastModified && saved) headers['If-Modified-Since']=lastModified;
  const upstream=await fetch(FORECAST_URL,{headers,signal:AbortSignal.timeout(10000)});
  if (upstream.status===304 && saved) {
    expiresAt=computeExpiry(upstream,now);
    return saved;
  }
  if (!upstream.ok) throw new Error(`MET API svarte med ${upstream.status}`);
  const len=Number(upstream.headers.get('content-length')||0);
  if (len > 4_000_000) throw new Error('Værdata er for store');
  const forecast=await upstream.json();
  const days=summarizeForecast(forecast);
  if (!Object.keys(days).length) throw new Error('Ingen brukbare dager i værmeldingen');
  saved={source:'Yr / Meteorologisk institutt',sourceUrl:'https://www.yr.no/',
    pentUrl:PENT_LINK,location:FORECAST_LOCATION,updatedAt:forecast?.properties?.meta?.updated_at||new Date(now).toISOString(),days};
  lastModified=upstream.headers.get('last-modified')||null;
  expiresAt=computeExpiry(upstream,now);
  return saved;
}
export default async function handler(){
  try {
    // Prevent parallel fetch storms within a warm Netlify function instance.
    if(!pending)pending=fetchWeather().finally(()=>{pending=null});
    const data=await pending;
    const ttl=Math.min(3600,Math.max(300,Math.floor((expiresAt-Date.now())/1000)));
    return reply({...data,stale:false},200,ttl);
  } catch(err) {
    console.error('Værmelding kunne ikke hentes:',err);
    if (saved) return reply({...saved,stale:true,warning:'Kunne ikke hente fersk værmelding. Viser sist hentet prognose.'},200,300);
    return reply({status:'error',warning:'Værmelding er midlertidig utilgjengelig.'},502);
  }
}
