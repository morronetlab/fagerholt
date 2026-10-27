import {siteConfig} from '../../public/site-config.mjs';
import {schoolCalendar} from '../../lib/calendar.mjs';
import {findPdfLinks,choosePdf,analyzePdfPages,pdfItemsFromTextContent} from '../../lib/plan-core.mjs';
const MAX_PDF_BYTES=14*1024*1024;
const HEADERS={'User-Agent':'Mozilla/5.0 (compatible; Ukeplanen/0.1; +https://github.com/morronetlab/fagerholt)','Accept-Language':'nb-NO,nb;q=0.9'};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':status===200?'public, max-age=60, s-maxage=900':'no-store',
  'X-Content-Type-Options':'nosniff'
}});
function allowedUrl(url,requirePdf=false){
  try {const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&siteConfig.allowedSourceHosts.includes(u.hostname)&&(!requirePdf||/\.pdf$/i.test(u.pathname));}
  catch{return false;}
}
async function load(url,{pdf=false,fetchImpl=fetch}={}){
  if(!allowedUrl(url,pdf)) throw new Error('Ikke godkjent kildeadresse');
  const res=await fetchImpl(url,{headers:HEADERS,redirect:'follow',signal:AbortSignal.timeout(11000)});
  if(!res.ok)throw new Error(`Skolens nettsted svarte ${res.status}`);
  if(!allowedUrl(res.url||url,pdf))throw new Error('Uventet videresending fra skolekilden');
  const limit=pdf?MAX_PDF_BYTES:1_000_000;
  const len=Number(res.headers.get('content-length')||0);
  if(len>limit)throw new Error('Kildedokument er for stort');
  const bytes=new Uint8Array(await res.arrayBuffer());
  if(bytes.byteLength>limit)throw new Error('Kildedokument er for stort');
  if(pdf){if(new TextDecoder('ascii').decode(bytes.slice(0,4))!=='%PDF')throw new Error('Ikke gyldig PDF');return bytes;}
  return new TextDecoder().decode(bytes);
}
export async function pdfPages(bytes){
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const job=getDocument({data:bytes,useSystemFonts:true,disableFontFace:true,isEvalSupported:false});
  const document=await job.promise;
  try {
    if(document.numPages<1||document.numPages>16)throw new Error('Uventet antall PDF-sider');
    const pages=[];
    for(let n=1;n<=document.numPages;n++){
      const page=await document.getPage(n),size=page.getViewport({scale:1});
      pages.push(pdfItemsFromTextContent(await page.getTextContent(),size.width,size.height));
      page.cleanup();
    }
    return pages;
  }finally{await job.destroy();}
}
/** Dependency injection is used only for local tests; no sample data in live API. */
export function createPlanHandler({fetchImpl=fetch,parsePdfPages=pdfPages,now=()=>new Date()}={}){
  return async function handler(request){
    const grade=new URL(request.url).searchParams.get('grade');
    const source=siteConfig.school.grades[grade];
    if(!grade||!source)return reply({status:'error',error:'Velg et gyldig klassetrinn (1–7).'},400);
    const {year,week}=schoolCalendar(now(),siteConfig.school.timezone);
    const base={grade,week,year,source,checkedAt:new Date().toISOString()};
    try{
      const html=await load(source,{fetchImpl});
      const pdf=choosePdf(findPdfLinks(html,source,siteConfig.allowedSourceHosts),week);
      if(!pdf)return reply({...base,status:'unpublished',pdf:null,warning:`Ukeplan for uke ${week} er ikke publisert som PDF på trinnsiden.`});
      const bytes=await load(pdf.url,{pdf:true,fetchImpl});
      const pages=await parsePdfPages(bytes);
      return reply({...base,...analyzePdfPages(pages,grade,pdf.url,week,year,source),publishedWeek:pdf.week});
    }catch(error){
      console.error('Failed to fetch published school PDF:',grade,error);
      return reply({...base,status:'error',warning:'Klarte ikke hente eller lese skolens ukeplan. Prøv igjen, eller åpne trinnsiden.'},502);
    }
  };
}
export default createPlanHandler();
