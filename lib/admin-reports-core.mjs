/** Protected administration API for source-backed feedback reports.
 * Supabase verifies the browser JWT; a server-only user ID allowlist decides admin access.
 * Neither FEEDBACK_ADMIN_TOKEN nor Supabase service-role keys are exposed to browsers.
 */
import {openIssueStore} from './issue-report-core.mjs';

const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
 'X-Robots-Tag':'noindex, nofollow'
}});
const DAY=/^\d{4}-\d{2}-\d{2}$/u;
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const STATES=Object.freeze(['new','in_progress','resolved']);
const isoDay=t=>new Date(t).toISOString().slice(0,10);
const validDay=x=>{if(!DAY.test(x))return false;
 const date=new Date(x+'T00:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===x;
};
const reportKey=(day,id)=>'reports/'+day+'/'+id+'.json';
const reviewKey=(day,id)=>'review/'+day+'/'+id+'.json';
export async function verifyFeedbackAdmin(request,{env=process.env,fetchImpl=fetch}={}){
 const allowed=env.FEEDBACK_ADMIN_USER_ID;
 if(typeof allowed!=='string'||!ID.test(allowed))return {ok:false,status:503};
 const token=(request.headers.get('authorization')||'').match(/^Bearer ([^\s]+)$/u)?.[1];
 if(!token||token.length>8192)return {ok:false,status:401};
 const base=env.SUPABASE_URL,key=env.SUPABASE_PUBLISHABLE_KEY;
 let url;
 try{url=new URL(base);
  if(url.protocol!=='https:'||!/^[a-z0-9-]+\.supabase\.co$/u.test(url.hostname)||
     url.pathname!=='/')return {ok:false,status:503};
 }catch{return {ok:false,status:503};}
 if(typeof key!=='string'||key.length<20)return {ok:false,status:503};
 try{
  const response=await fetchImpl(url.origin+'/auth/v1/user',{
   headers:{apikey:key,Authorization:'Bearer '+token,Accept:'application/json'},
   cache:'no-store',signal:AbortSignal.timeout(8000)
  });
  if(!response.ok)return {ok:false,status:401};
  const user=await response.json();
  return {ok:user?.id===allowed,status:user?.id===allowed?200:403};
 }catch{return {ok:false,status:503};}
}
async function enumerate(store,prefix,max=250){
 const keys=[],seen=new Set();let cursor;
 do{
  const options={prefix,limit:100,...(cursor?{cursor}:{})};
  const page=await store.list(options);
  for(const row of page?.blobs||[]){
   if(row?.key?.startsWith(prefix)&&!seen.has(row.key)){seen.add(row.key);keys.push(row.key);}
   if(keys.length>=max)break;
  }
  if(keys.length>=max)break;
  cursor=page?.cursor||null;
 }while(cursor);
 return keys;
}
async function fetchReports(store,days,now){
 const end=Date.parse(isoDay(now())+'T00:00:00Z'),dates=[];
 for(let i=0;i<days;i++)dates.push(isoDay(end-i*86400_000));
 const all=[];
 // Keep backend traffic bounded even when there are many historic reports.
 for(let i=0;i<dates.length;i+=5){
  const batches=await Promise.all(dates.slice(i,i+5).map(async date=>{
   const keys=await enumerate(store,'reports/'+date+'/',150);
   const reports=await Promise.all(keys.map(async key=>{
    const value=await store.get(key,{type:'json',consistency:'strong'});
    if(!value||!ID.test(value.id||''))return null;
    const state=await store.get(reviewKey(date,value.id),{type:'json',consistency:'strong'});
    return {...value,reviewStatus:STATES.includes(state?.status)?state.status:'new',
     reviewedAt:state?.updatedAt||null};
   }));
   return reports.filter(Boolean);
  }));
  for(const rows of batches)all.push(...rows);
  if(all.length>=300)break;
 }
 return all.sort((a,b)=>String(b.submittedAt||'').localeCompare(String(a.submittedAt||''))).slice(0,300);
}
export function createAdminReportsHandler({storeFactory=openIssueStore,env=process.env,
 now=Date.now,verify=verifyFeedbackAdmin}={}){
 return async request=>{
  if(!['GET','PATCH'].includes(request.method))return reply({error:'Metoden støttes ikke'},405);
  const auth=await verify(request,{env});
  if(!auth?.ok)return reply({error:auth?.status===403?'Kontoen har ikke administratortilgang.':
   auth?.status===503?'Administrasjonstjenesten er ikke konfigurert eller tilgjengelig.':'Logg inn for å fortsette.'},auth?.status||401);
  let store;
  try{store=await storeFactory();}catch{return reply({error:'Rapportlageret er ikke tilgjengelig.'},503);}
  if(request.method==='GET'){
   const query=new URL(request.url).searchParams,days=Number(query.get('days')||14);
   if(![7,14,30].includes(days))return reply({error:'Ugyldig periode'},400);
   try{return reply({reports:await fetchReports(store,days,now),days,generatedAt:new Date(now()).toISOString()});}
   catch{return reply({error:'Kunne ikke hente rapportene.'},503);}
  }
  const origin=request.headers.get('origin');
  if(origin){try{if(new URL(origin).origin!==new URL(request.url).origin)return reply({error:'Ugyldig opphav'},403);}
   catch{return reply({error:'Ugyldig opphav'},403);}}
  else if(request.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Ugyldig opphav'},403);
  if(!/^application\/json(?:\s*;|$)/iu.test(request.headers.get('content-type')||''))
   return reply({error:'Forventet JSON'},415);
  let data;
  try{const body=await request.text();if(body.length>500)return reply({error:'For stor forespørsel'},413);data=JSON.parse(body);}
  catch{return reply({error:'Ugyldig JSON'},400);}
  if(!data||!validDay(data.date||'')||!ID.test(data.id||'')||
      !STATES.includes(data.status))return reply({error:'Ugyldig rapport eller status'},400);
  try{
   const existing=await store.get(reportKey(data.date,data.id),{type:'json',consistency:'strong'});
   if(!existing||existing.id!==data.id)return reply({error:'Fant ikke rapporten'},404);
   const updatedAt=new Date(now()).toISOString();
   await store.setJSON(reviewKey(data.date,data.id),{status:data.status,updatedAt});
   return reply({id:data.id,status:data.status,updatedAt});
  }catch{return reply({error:'Kunne ikke lagre status.'},503);}
 };
}
