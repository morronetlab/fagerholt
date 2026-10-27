import {SITE, GRADES} from '../../public/site-config.mjs';
import {CLASS_URLS,osloCalendar,findPdfLinks,choosePdf,analyzePdfPages,pdfItemsFromTextContent} from '../../lib/plan-core.mjs';
const MAX_PDF_BYTES = 14 * 1024 * 1024;
const HEADERS = {'user-agent':'Mozilla/5.0 (compatible; Skolesekken/1.0; family week planner)','accept-language':'nb-NO,nb;q=0.9,en;q=0.6'};
const respond = (data,code=200)=>new Response(JSON.stringify(data),{
 status:code,
 headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=60, s-maxage=900, stale-while-revalidate=600','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'}
});
function checkPdfUrl(value){
 const u=new URL(value);
 return u.protocol==='https:' && SITE.pdfHosts.includes(u.hostname) && /\.pdf$/i.test(u.pathname);
}
async function download(url,expectedPdf=false){
 const response=await fetch(url,{headers:HEADERS,signal:AbortSignal.timeout(11000)});
 if(!response.ok)throw new Error('Skolen svarte med HTTP '+response.status);
 if(expectedPdf){
   if(!checkPdfUrl(response.url))throw new Error('Uventet PDF-adresse');
   const length=Number(response.headers.get('content-length'));
   if(length>MAX_PDF_BYTES)throw new Error('Ukeplanen er større enn tillatt grense');
   const bytes=new Uint8Array(await response.arrayBuffer());
   if(bytes.byteLength>MAX_PDF_BYTES||String.fromCharCode(...bytes.slice(0,4))!=='%PDF')throw new Error('Ugyldig eller for stor PDF');
   return bytes;
 }
 return response.text();
}
async function pdfPages(bytes){
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const loading=getDocument({data:bytes,useSystemFonts:true,disableFontFace:true,isEvalSupported:false});
 const doc=await loading.promise;
 try{
   if(doc.numPages<1||doc.numPages>12)throw new Error('Uventet antall sider i PDF-en');
   const pages=[];
   for(let n=1;n<=doc.numPages;n++){
     const page=await doc.getPage(n),viewport=page.getViewport({scale:1});
     const content=await page.getTextContent();
     pages.push(pdfItemsFromTextContent(content,viewport.width,viewport.height));
     page.cleanup();
   }
   return pages;
 }finally{await loading.destroy()}
}
export default async (request)=>{
 const grade=new URL(request.url).searchParams.get('grade');
 if(!GRADES.includes(grade))return respond({error:'Velg et gyldig klassetrinn (1–7).'},400);
 const {year,week}=osloCalendar();
 const base={grade,week,year,source:CLASS_URLS[grade],checkedAt:new Date().toISOString()};
 try{
   const html=await download(CLASS_URLS[grade]);
   const links=findPdfLinks(html,CLASS_URLS[grade]);
   const pdf=choosePdf(links,week);
   if(!pdf){
     return respond({...base,status:'unpublished',pdf:null,latestAvailable:links[0]||null,
       warning:`Fant ingen publisert ukeplan for uke ${week} på skolesiden ennå. Åpne trinnsiden for å dobbeltsjekke.`});
   }
   const pages=await pdfPages(await download(pdf.url,true));
   return respond({...base,...analyzePdfPages(pages,grade,pdf.url,week,year,{redGroup:grade==='3' && SITE.features.redGroupGrade3}),publishedWeek:pdf.week});
 }catch(err){
   console.error('Week plan fetch failed',grade,err);
   return respond({...base,status:'error',warning:'Kunne ikke hente eller lese skolens ukeplan akkurat nå.',technicalError:err?.message?.slice(0,110)},502);
 }
};
