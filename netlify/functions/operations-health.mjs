/** Private administrative API: never render family, device, or student data. */
import {authorizedOperations,operationsSummary} from '../../lib/operations-monitor.mjs';
const response=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'private, no-store, max-age=0',
  'Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff',
  'X-Robots-Tag':'noindex, nofollow'
 }});
export function createOperationsHealthHandler({
 authorization=authorizedOperations,summary=operationsSummary,env=process.env
}={}){
 return async request=>{
  if(request.method!=='GET')return response({error:'Kun GET støttes'},405);
  if(!authorization(request,env))return response({error:'Ingen tilgang'},401);
  try{return response(await summary({env}));}
  catch(error){
   console.warn('Operations dashboard unavailable',String(error?.message||'error').slice(0,80));
   return response({error:'Kunne ikke hente driftsstatus'},503);
  }
 };
}
export default createOperationsHealthHandler();
