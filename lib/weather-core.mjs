/** Weather summary for school days in the Europe/Oslo timezone.
 * Forecast data: MET Norway Locationforecast (the Yr forecast for Pent coordinates).
 */
const OSLO = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Oslo', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23'
});
import {SITE} from '../public/site-config.mjs';
export const FORECAST_LOCATION = Object.freeze({lat:SITE.weather.lat,lon:SITE.weather.lon});
export const PENT_LINK = SITE.weather.externalUrl;
function osloDateHour(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(OSLO.formatToParts(date).filter(x=>x.type !=='literal').map(x=>[x.type,x.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}
function finite(value) {return typeof value === 'number' && Number.isFinite(value) ? value : null;}
function iconFor(code) {
  if (/thunder/.test(code)) return ['⛈️','Torden'];
  if (/snow/.test(code)) return ['🌨️','Snø'];
  if (/sleet/.test(code)) return ['🌨️','Sludd'];
  if (/rainshowers/.test(code)) return ['🌦️','Regnbyger'];
  if (/rain/.test(code)) return ['🌧️','Regn'];
  if (/fog/.test(code)) return ['🌫️','Tåke'];
  if (/partlycloudy/.test(code)) return ['⛅','Delvis skyet'];
  if (/fair/.test(code)) return ['🌤️','Lettskyet'];
  if (/clearsky/.test(code)) return ['☀️','Sol'];
  if (/cloudy/.test(code)) return ['☁️','Skyet'];
  return ['🌤️','Værmelding'];
}
const round1 = v => Math.round(v*10)/10;

/** Summarize available forecast times into selected-day school-hour weather, 08:00–15:00.
 * Rain is an approximation over the school day, and 6h blocks are apportioned by hour.
 * Unavailable values are null, never invented as zero.
 */
export function summarizeForecast(forecast) {
  const times = forecast?.properties?.timeseries;
  if (!Array.isArray(times)) throw new Error('Ugyldig værmelding fra MET');
  const groups = new Map();
  for (const entry of times) {
    const when = osloDateHour(entry?.time);
    if (!when) continue;
    const {date,hour} = when;
    if (!groups.has(date)) groups.set(date, []);
    const details = entry.data?.instant?.details || {};
    const one = entry.data?.next_1_hours;
    const six = entry.data?.next_6_hours;
    const twelve = entry.data?.next_12_hours;
    const symbol = one?.summary?.symbol_code || six?.summary?.symbol_code || twelve?.summary?.symbol_code || '';
    const hourlyPrecip = finite(one?.details?.precipitation_amount);
    const sixPrecip = finite(six?.details?.precipitation_amount);
    // Precipitation is attached to its forecast period. 1h is preferred over 6h.
    const period = hourlyPrecip !== null ? 1 : sixPrecip !== null ? 6 : 0;
    groups.get(date).push({hour, temp:finite(details.air_temperature), wind:finite(details.wind_speed), symbol,
      precip:period === 1 ? hourlyPrecip : sixPrecip, period});
  }
  const days = {};
  for (const [date, entries] of groups) {
    const school = entries.filter(e => e.hour >= 8 && e.hour < 15);
    if (!school.length) continue;
    const temps = school.map(e=>e.temp).filter(e=>e!==null);
    const winds = school.map(e=>e.wind).filter(e=>e!==null);
    const symbolCandidates = school.filter(e=>e.symbol);
    const mid = (symbolCandidates.length ? symbolCandidates : school)
      .slice().sort((a,b)=>Math.abs(a.hour-12)-Math.abs(b.hour-12))[0];
    const precipPoints = school.filter(e=>e.period && e.precip!==null);
    // 6h data is a lower resolution fallback. Report approximate rain and label it.
    // Avoid summing a 6h amount on top of more granular hourly data for the same day.
    const hourly = precipPoints.filter(e=>e.period===1);
    const rain = hourly.length ? hourly.reduce((v,e)=>v+e.precip,0) :
      precipPoints.reduce((v,e)=>v+e.precip * Math.min(e.period,Math.max(0,15-e.hour))/e.period,0);
    const [icon,description] = iconFor(mid?.symbol||'');
    days[date] = {
      date, icon, description, symbol:mid?.symbol||null,
      temperature: mid?.temp ?? null,
      minTemp: temps.length ? Math.min(...temps) : null,
      maxTemp: temps.length ? Math.max(...temps) : null,
      rainMm: precipPoints.length ? round1(rain) : null,
      rainApproximate: !hourly.length && precipPoints.length > 0,
      windMs: winds.length ? round1(Math.max(...winds)) : null
    };
  }
  return days;
}
