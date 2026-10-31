/** Public, week-scoped snapshot cache and short batching policy for the family view.
 * Only official public school-calendar responses are cached, never child/account data.
 */
export const FAMILY_CALENDAR_CACHE_TTL=15*60_000;
export const FAMILY_OVERVIEW_BATCH_MS=3200;
export const FAMILY_CALENDAR_CACHE_PREFIX='skoleuka.municipal.v1:';
export const familyCalendarCacheKey=(school,year,week)=>
 FAMILY_CALENDAR_CACHE_PREFIX+school+':'+year+':'+week;
export function cacheableCalendar(data,school,year,week){
 return !!data&&data.schoolId===school&&data.year===year&&data.week===week&&
  ['live','snapshot'].includes(data.sourceStatus)&&
  Array.isArray(data.events)&&data.events.length<=80&&
  data.events.every(x=>/^\\d{4}-\\d{2}-\\d{2}$/u.test(x?.date||''));
}
export function readCalendarCache(storage,school,year,week,now=Date.now()){
 try{
  const raw=storage?.getItem(familyCalendarCacheKey(school,year,week));
  if(!raw||raw.length>60000)return null;
  const entry=JSON.parse(raw),age=now-entry.at;
  if(!Number.isFinite(age)||age<0||age>=FAMILY_CALENDAR_CACHE_TTL||
    !cacheableCalendar(entry.data,school,year,week))return null;
  return entry.data;
 }catch{return null;}
}
export function storeCalendarCache(storage,data,school,year,week,now=Date.now()){
 if(!cacheableCalendar(data,school,year,week))return false;
 try{
  storage?.setItem(familyCalendarCacheKey(school,year,week),JSON.stringify({at:now,data}));
  return true;
 }catch{return false;}
}
/** Give nearby async results a chance to join one first paint; never block forever. */
export function holdInitialHighlights({startedAt=0,now=Date.now(),pendingPairs=0,
 pendingCalendars=0}={}){
 return startedAt>0&&now-startedAt<FAMILY_OVERVIEW_BATCH_MS&&
  (pendingPairs>0||pendingCalendars>0);
}
