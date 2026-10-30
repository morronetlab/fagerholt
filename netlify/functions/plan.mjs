import {siteConfig} from '../../public/site-config.mjs';
import {schoolCalendar} from '../../lib/calendar.mjs';
import {findPdfLinks,choosePdf,analyzePdfPages,pdfItemsFromTextContent} from '../../lib/plan-core.mjs';
import {aiConfigured,cacheKey,digestPdf,openAIStore,queueAIJob,lockKey,failureKey,createStatusToken} from '../../lib/ai-runtime.mjs';
import {getSchool,validGradeCode,locateGradeSections,isSchoolSectionUrl} from '../../lib/schools.mjs';
import {reconcileHomeworkWithPdf,HOMEWORK_SOURCE_VERSION} from '../../lib/homework-source-truth.mjs';
import {stripSyntheticPackingNotices} from '../../lib/packing-source.mjs';
const MAX_PDF_BYTES=14*1024*1024;
const HEADERS={'User-Agent':'Mozilla/5.0 (compatible; Ukeplanen/0.1; +https://github.com/morronetlab/fagerholt)','Accept-Language':'nb-NO,nb;q=0.9'};
const reply=(body,status=200)=>new Response(JSON.stringify(stripSyntheticPackingNotices(body)),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':status===200&&!['processing','failed'].includes(body.aiStatus)?'public, max-age=30, s-maxage=60':'no-store',
  'X-Content-Type-Options':'nosniff'
}});
function allowedUrl(url,requirePdf=false){
  try {const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&siteConfig.allowedSourceHosts.includes(u.hostname)&&(!requirePdf||/\.pdf$/i.test(u.pathname));}
  catch{return false;}
}
async function load(url,{pdf=false,fetchImpl=fetch}={}){
  if(!allowedUrl(url,pdf)) throw new Error('Ikke godkjent kildeadresse');
  const res=await fetchImpl(url,{headers:HEADERS,redirect:'follow',signal:AbortSignal.timeout(pdf ? 24000 : 12000)});
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
export function createPlanHandler({fetchImpl=fetch,parsePdfPages=pdfPages,now=()=>new Date(),
    storeFactory=openAIStore,queueJob=queueAIJob,env=process.env}={}){
  return async function handler(request){
    if(request.method&&request.method!=='GET')return reply({error:'Kun GET støttes'},405);
    const started=performance.now();
    const metrics={};
    const mark=label=>{metrics[label]=Math.round(performance.now()-started);};
    const query=new URL(request.url).searchParams;
    const statusOnly=query.get('statusOnly')==='1';
    // Existing /api/plan?grade=4 bookmarks retain Fagerholt behavior.
    const schoolId=query.get('school')||siteConfig.school.id;
    const school=getSchool(schoolId);
    const grade=query.get('grade');
    if(!school)return reply({status:'error',error:'Ukjent skole.'},400);
    if(!validGradeCode(grade))return reply({status:'error',error:'Velg et gyldig klassetrinn (1–7).'},400);
    // Only the current or immediately following school week can be requested.
    const nextWeek=query.get('nextWeek')==='1';
    const nowDate=now();
    const targetDate=nextWeek?new Date(nowDate.getTime()+7*86400000):nowDate;
    const {year,week}=schoolCalendar(targetDate,school.timezone);
    const base={schoolId:school.id,schoolName:school.name,grade,week,year,checkedAt:new Date().toISOString()};
    try{
      let source=school.grades?.[grade];
      if(!source){
        const found=await locateGradeSections(school,url=>load(url,{fetchImpl}));
        source=found[grade];
        if(!source)return reply({...base,source:school.homepage,pdf:null,status:'unavailable',
          warning:'Fant ikke en offisiell trinnside for dette klassetrinnet. Åpne skolens nettside for å kontrollere om trinnet har en ukeplan.'});
      }
      if(!isSchoolSectionUrl(source,school,grade))throw new Error('Ugyldig trinnside');
      base.source=source;
      const html=await load(source,{fetchImpl});
      mark('schoolPageMs');
      const pdf=choosePdf(findPdfLinks(html,source,siteConfig.allowedSourceHosts),week);
      if(!pdf)return reply({...base,status:'unpublished',pdf:null,warning:`Ukeplan for uke ${week} er ikke publisert som PDF på trinnsiden.`});
      const bytes=await load(pdf.url,{pdf:true,fetchImpl});
      mark('pdfDownloadMs');
      let aiStatus='disabled',jobId=null;
      if(aiConfigured(env)){
        try{
          const hash=digestPdf(bytes);
          const key=cacheKey({school:school.id,grade,year,week,hash,model:env.OPENAI_MODEL||'gpt-4.1-mini'});
          const store=await storeFactory();
          const cached=await store.get(key,{type:'json',consistency:'strong'});
          if(cached?.parser==='ai'&&(cached.schoolId===school.id||(school.id==='fagerholt'&&!cached.schoolId))&&cached.grade===grade&&cached.week===week&&cached.year===year&&cached.pdf===pdf.url){
            // A read-only status check never parses the PDF; when the browser
            // receives ready without source verification, it reloads /api/plan.
            if(statusOnly)return reply({...base,...cached,pdfSizeBytes:bytes.length,publishedWeek:pdf.week,aiStatus:'ready'});
            let ready=cached;
            // AI results cached before source-verified deadlines are still
            // repairable. Validate once against the original PDF coordinates,
            // then persist the corrected plan without re-running the model.
            if(cached.homeworkSourceVersion!==HOMEWORK_SOURCE_VERSION){
              try{
                const pageLayouts=await parsePdfPages(bytes.slice());
                if(pageLayouts.length){
                  const checked=reconcileHomeworkWithPdf(cached.homework,pageLayouts);
                  ready={...cached,homework:checked.homework,homeworkSourceVersion:HOMEWORK_SOURCE_VERSION,
                    homeworkSourceVerified:checked.verified};
                  try{await store.setJSON(key,ready);}
                  catch(error){console.warn('Could not persist corrected homework cache:',error?.message);}
                }
              }catch(error){console.warn('Could not verify cached homework source:',error?.message);}
            }
            return reply({...base,...ready,pdfSizeBytes:bytes.length,publishedWeek:pdf.week,aiStatus:'ready'});
          }
          if(statusOnly){
            // Read-only job inspection: never dispatch another background job.
            // This also avoids parsing the PDF again on every polling request.
            const [lock,failure]=await Promise.all([
              store.get(lockKey(key),{type:'json',consistency:'strong'}),
              store.get(failureKey(key),{type:'json',consistency:'strong'})
            ]);
            const running=Number(lock?.expiresAt)>Date.now();
            const failed=Number(failure?.retryAt)>Date.now();
            return reply({...base,pdf:pdf.url,pdfSizeBytes:bytes.length,publishedWeek:pdf.week,status:'partial',parser:'rules',
              aiStatus:failed||!running?'failed':'processing',
              warning:failed||!running?'Ingen aktiv AI-analyse ble funnet. Velg «Prøv igjen» for å starte et nytt forsøk.':'AI-analysen kjører fortsatt.'});
          }
          aiStatus=await queueJob({request,store,key,job:{schoolId:school.id,grade,week,year,source,pdf:pdf.url,hash},env});
          if(aiStatus==='processing')jobId=createStatusToken({school:school.id,grade,year,week,hash,model:env.OPENAI_MODEL||'gpt-4.1-mini',pdf:pdf.url},env.AI_JOB_SECRET);
          mark('queueMs');
        }catch(error){
          console.error('AI job unavailable; using rule-based PDF parser:',error?.message);
          aiStatus='unavailable';
        }
      }
      if(statusOnly)return reply({...base,pdf:pdf.url,pdfSizeBytes:bytes.length,publishedWeek:pdf.week,
        status:'partial',parser:'rules',aiStatus:aiStatus==='unavailable'?'processing':'failed',
        warning:'Statusen kunne ikke kontrolleres akkurat nå. Ny statuskontroll starter ikke AI-analysen på nytt.'});
      // The provisional rule-based plan is hidden while AI works.
      // Avoid a redundant full PDF.js pass before returning the job handle.
      if(aiStatus==='processing'&&!statusOnly){
        mark('totalMs');
        console.info('ukeplan.initial_timings',JSON.stringify({...metrics,school:school.id,grade,pdfBytes:bytes.length,aiStatus}));
        return reply({...base,pdf:pdf.url,publishedWeek:pdf.week,pdfSizeBytes:bytes.length,
          aiStatus,jobId,status:'partial',parser:'rules',parsedFromPdf:false,days:{},homework:[],
          notices:[],learningGoals:[],subjects:[],everyday:[],
          warning:'AI analyserer original-PDF-en. Innholdet vises når analysen er ferdig.'});
      }
      let pages;
      try{pages=await parsePdfPages(bytes);}
      catch(error){
        if(aiStatus==='processing'||aiStatus==='failed')return reply({...base,pdf:pdf.url,publishedWeek:pdf.week,aiStatus,
          status:'partial',parser:'rules',parsedFromPdf:false,days:{},homework:[],notices:[],learningGoals:[],subjects:[],everyday:[],weekTheme:null,optionalMission:null,
          warning:aiStatus==='failed'?'AI-analysen feilet. Et nytt forsøk tillates etter fem minutter; se original-PDF-en.':'AI analyserer PDF-en. Dagsprogram og lekser blir tilgjengelig etter at analysen er klar.'});
        throw error;
      }
      const textChars=pages.reduce((count,page)=>count+(page.items||[]).reduce((n,item)=>n+String(item.text||'').trim().length,0),0);
      // A scanned/image-only PDF has no searchable text and cannot be trusted as a parsed plan.
      if(textChars<20){
        return reply({...base,pdf:pdf.url,publishedWeek:pdf.week,aiStatus,parser:'rules',status:aiStatus==='processing'?'partial':'unreadable',parsedFromPdf:false,
          warning:aiStatus==='processing'?'AI analyserer original-PDF-en selv om den mangler et lesbart tekstlag.':aiStatus==='failed'?'AI-analysen feilet. PDF-en har heller ikke et lesbart tekstlag. Prøv igjen etter fem minutter eller åpne originalen.':'Ukeplan-PDF-en har ikke et lesbart tekstlag. Åpne original-PDF-en.',
          days:{},homework:[],learningGoals:[],notices:[],subjects:[],weekTheme:null,optionalMission:null,everyday:[]});
      }
      const fallback=analyzePdfPages(pages,grade,pdf.url,week,year,source);
      mark('totalMs');
      console.info('ukeplan.initial_timings',JSON.stringify({...metrics,school:school.id,grade,pdfBytes:bytes.length,aiStatus}));
      if(aiStatus==='failed')fallback.warning='AI-analysen feilet. Viser foreløpig regelbasert utdrag. Automatisk nytt forsøk etter fem minutter. Sjekk original-PDF-en.';
      return reply({...base,...fallback,pdfPageCount:pages.length,pdfSizeBytes:bytes.length,publishedWeek:pdf.week,parser:'rules',aiStatus});
    }catch(error){
      console.error('Failed to fetch published school PDF:',grade,error);
      return reply({...base,status:'error',warning:'Klarte ikke hente eller lese skolens ukeplan. Prøv igjen, eller åpne trinnsiden.'},502);
    }
  };
}
export default createPlanHandler();
