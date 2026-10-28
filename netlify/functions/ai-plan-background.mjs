/** Server-side asynchronous AI PDF processing. Only signed plan.mjs jobs are accepted. */
import {siteConfig} from '../../public/site-config.mjs';
import {pdfPages} from './plan.mjs';
import {interpretPdfWithAI} from '../../lib/ai-plan.mjs';
import {aiConfigured,cacheKey,digestPdf,openAIStore,validSignature,releaseJob,failureKey} from '../../lib/ai-runtime.mjs';
import {getSchool,validGradeCode,isSchoolSectionUrl} from '../../lib/schools.mjs';

export const config={background:true};
const fail=(code,message)=>new Response(message,{status:code});
function safePdfUrl(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&siteConfig.allowedSourceHosts.includes(u.hostname)&&/\.pdf$/i.test(u.pathname);}
 catch{return false;}
}
export function createAIBackgroundHandler({fetchImpl=fetch,storeFactory=openAIStore,interpret=interpretPdfWithAI,parsePages=pdfPages,env=process.env}={}){
 return async request=>{
   if(request.method!=='POST')return fail(405,'Method not allowed');
   if(!aiConfigured(env))return fail(503,'AI not configured');
   const body=await request.text();
   if(body.length>2400||!validSignature(body,request.headers.get('X-Weekplan-Signature'),env.AI_JOB_SECRET))return fail(401,'Unauthorized');
   let job;
   try{job=JSON.parse(body);}catch{return fail(400,'Invalid JSON');}
   const {schoolId,grade,week,year,source,pdf,hash}=job;
   const school=getSchool(schoolId||siteConfig.school.id);
   if(!school||!validGradeCode(String(grade))||!isSchoolSectionUrl(source,school,String(grade))||
      !Number.isInteger(week)||week<1||week>53||!Number.isInteger(year)||year<2020||year>2100||
      !safePdfUrl(pdf)||!/^[a-f0-9]{64}$/.test(hash))return fail(400,'Invalid source');
   const key=cacheKey({school:school.id,grade,year,week,hash,model:env.OPENAI_MODEL||'gpt-4.1-mini'});
   let store;
   try{
     store=await storeFactory();
     if(await store.get(key,{type:'json',consistency:'strong'}))return new Response(null,{status:204});
     const response=await fetchImpl(pdf,{headers:{'User-Agent':'Ukeplanen/AI-parser (https://github.com/morronetlab/fagerholt)'},signal:AbortSignal.timeout(30000)});
     if(!response.ok||!safePdfUrl(response.url||pdf))throw new Error('Could not download trusted PDF');
     const contentLength=Number(response.headers.get('content-length')||0);
     if(contentLength>14*1024*1024)throw new Error('PDF is too large');
     const bytes=new Uint8Array(await response.arrayBuffer());
     if(bytes.length>14*1024*1024||new TextDecoder('ascii').decode(bytes.slice(0,4))!=='%PDF'||digestPdf(bytes)!==hash)throw new Error('PDF content changed');
     // PDF.js may transfer ownership of its Uint8Array into a worker, detaching
     // the underlying ArrayBuffer. Keep an independent copy for the AI upload.
     const aiPdfBytes=bytes.slice();
     let pages=[];
     try{pages=await parsePages(bytes);}catch(err){console.warn('PDF.js text extraction unavailable; model receives original PDF',err?.message);}
     const pageTexts=pages.map(p=>p.items?.map(x=>x.text).join(' ')||'');
     const normalized=await interpret(aiPdfBytes,{grade,week,year,source,pdf,pageCount:pages.length||16,pageTexts,
       fetchImpl,apiKey:env.OPENAI_API_KEY,model:env.OPENAI_MODEL||'gpt-4.1-mini'});
     await store.setJSON(key,{...normalized,schoolId:school.id,schoolName:school.name,createdAt:new Date().toISOString(),model:env.OPENAI_MODEL||'gpt-4.1-mini'});
     try{await store.delete(failureKey(key));}catch{}
     return new Response(null,{status:204});
   }catch(error){
     console.error('AI PDF parsing failed',{grade,week,reason:error?.message?.slice(0,180)});
     if(store)try{await store.setJSON(failureKey(key),{retryAt:Date.now()+5*60_000});}catch{}
     return fail(500,'AI parsing failed');
   }finally{
     if(store)try{await releaseJob(store,key);}catch(error){console.error('AI job lock cleanup failed',error?.message);}
   }
 };
}
export default createAIBackgroundHandler();
