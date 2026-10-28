/** Strict read-only same-origin PDF proxy for showing ORIGINAL school illustrations.
 * The browser never passes a PDF URL. Only the current-week file discovered from
 * the selected school's verified MinSkole grade page may be fetched.
 */
import {siteConfig} from '../../public/site-config.mjs';
import {schoolCalendar} from '../../lib/calendar.mjs';
import {findPdfLinks,choosePdf} from '../../lib/plan-core.mjs';
import {getSchool,locateGradeSections,validGradeCode,isSchoolSectionUrl} from '../../lib/schools.mjs';
const MAX_PDF_BYTES=14*1024*1024;
function trusted(url,pdf=false){
 try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&siteConfig.allowedSourceHosts.includes(u.hostname)&&(!pdf||/\.pdf$/i.test(u.pathname));}catch{return false;}
}
async function read(url,{fetchImpl=fetch,pdf=false}={}){
 if(!trusted(url,pdf))throw new Error('Untrusted school source');
 const res=await fetchImpl(url,{headers:{'User-Agent':'Ukeplanen/PDF-preview','Accept-Language':'nb-NO'},signal:AbortSignal.timeout(pdf?30000:12000)});
 if(!res.ok||!trusted(res.url||url,pdf))throw new Error('School resource unavailable');
 const len=Number(res.headers.get('content-length')||0),limit=pdf?MAX_PDF_BYTES:1_000_000;
 if(len>limit)throw new Error('Source too large');
 const bytes=new Uint8Array(await res.arrayBuffer());
 if(bytes.length>limit)throw new Error('Source too large');
 return pdf?bytes:new TextDecoder().decode(bytes);
}
export function createPdfPreviewHandler({fetchImpl=fetch,now=()=>new Date()}={}){
 return async request=>{
  if(request.method!=='GET')return new Response('Only GET allowed',{status:405});
  const search=new URL(request.url).searchParams;
  const school=getSchool(search.get('school')),grade=search.get('grade');
  if(!school||!validGradeCode(grade))return new Response('Invalid school or grade',{status:400});
  try{
   const loader=url=>read(url,{fetchImpl});
   const source=school.grades?.[grade]||(await locateGradeSections(school,loader))[grade];
   if(!source||!isSchoolSectionUrl(source,school,grade))return new Response('Grade page unavailable',{status:404});
   const {week}=schoolCalendar(now(),school.timezone);
   const html=await loader(source);
   const selected=choosePdf(findPdfLinks(html,source,siteConfig.allowedSourceHosts),week);
   if(!selected)return new Response('Weekly PDF unavailable',{status:404});
   const bytes=await read(selected.url,{fetchImpl,pdf:true});
   if(new TextDecoder('ascii').decode(bytes.slice(0,4))!=='%PDF')return new Response('Invalid PDF',{status:502});
   return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="ukeplan.pdf"',
     'Cache-Control':'public, max-age=60, s-maxage=300','X-Content-Type-Options':'nosniff'}});
  }catch(error){console.error('PDF page preview failed',school.id,grade,error?.message);return new Response('PDF preview unavailable',{status:502});}
 };
}
export default createPdfPreviewHandler();
