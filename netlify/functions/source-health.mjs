/** Public, read-only calendar source freshness; no account or operational secrets. */
import {openHealthStore,healthSummary,HEALTH_KEY} from '../../lib/calendar-monitor.mjs';
export function createSourceHealthHandler({storeFactory=openHealthStore,now=Date.now}={}){
 return async request=>{
  if(request.method!=='GET')return new Response(null,{status:405});
  let data;
  try{
   const store=await storeFactory();
   const state=await store.get(HEALTH_KEY,{type:'json',consistency:'strong'});
   data=healthSummary(state,now());
  }catch(error){
   console.warn('Calendar health store unavailable',String(error?.message||'error').slice(0,100));
   data=healthSummary(null,now());
  }
  return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json; charset=utf-8',
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 };
}
export default createSourceHealthHandler();
