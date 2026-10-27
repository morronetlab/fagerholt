const dateHour = new Intl.DateTimeFormat('en-GB', {
  timeZone:'Europe/Oslo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'
});
function schoolHour(value) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  const p = Object.fromEntries(dateHour.formatToParts(d).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour)};
}
const numeric = n => typeof n==='number'&&Number.isFinite(n)?n:null;
function condition(symbol) {
  if (/thunder/.test(symbol)) return ['⛈️','Torden'];
  if (/snow|sleet/.test(symbol)) return ['🌨️','Snø eller sludd'];
  if (/rain/.test(symbol)) return ['🌧️','Regn eller byger'];
  if (/cloudy/.test(symbol)) return ['☁️','Skyet'];
  if (/fair|partlycloudy/.test(symbol)) return ['⛅','Lettskyet'];
  if (/clearsky/.test(symbol)) return ['☀️','Sol'];
  return ['🌤️','Værmelding'];
}
/** Approximation for school hours 08–15, no invented weather for missing hours. */
export function summarizeForecast(json) {
  if (!Array.isArray(json?.properties?.timeseries)) throw new Error('Ugyldig MET-respons');
  const groups=new Map();
  for (const v of json.properties.timeseries) {
    const t=schoolHour(v.time);
    if (!t || t.hour<8 || t.hour>=15) continue;
    const one=v.data?.next_1_hours; const six=v.data?.next_6_hours;
    const rain1=numeric(one?.details?.precipitation_amount);
    const rain6=numeric(six?.details?.precipitation_amount);
    const item={hour:t.hour,temp:numeric(v.data?.instant?.details?.air_temperature),wind:numeric(v.data?.instant?.details?.wind_speed),
      symbol:one?.summary?.symbol_code||six?.summary?.symbol_code||'',
      rain:rain1!==null?rain1:rain6,period:rain1!==null?1:rain6!==null?6:null};
    if (!groups.has(t.date)) groups.set(t.date,[]);
    groups.get(t.date).push(item);
  }
  const out={};
  for (const [date,rows] of groups) {
    rows.sort((a,b)=>a.hour-b.hour);
    const pick=rows.filter(x=>x.symbol).sort((a,b)=>Math.abs(a.hour-12)-Math.abs(b.hour-12))[0]||rows[0];
    const [icon,description]=condition(pick.symbol);
    const temps=rows.map(x=>x.temp).filter(x=>x!==null);
    const hourly=rows.filter(x=>x.period===1);
    const coarse=rows.filter(x=>x.period===6);
    const rawRain=hourly.length ? hourly.reduce((a,x)=>a+x.rain,0) : coarse.length ? coarse.reduce((a,x)=>a+x.rain*Math.min(6,15-x.hour)/6,0) : null;
    out[date]={date,icon,description,symbol:pick.symbol,temperature:pick.temp,
      minTemp:temps.length?Math.min(...temps):null,maxTemp:temps.length?Math.max(...temps):null,
      rainMm:rawRain===null?null:Math.round(rawRain*10)/10,
      rainApproximate:hourly.length===0&&coarse.length>0};
  }
  return out;
}
