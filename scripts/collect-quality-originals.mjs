/** Read-only retrieval of a small, fixed set of PUBLIC official school PDFs.
 * This is a TEMPORARY review artifact; do not check PDFs or extracted personal
 * data into the repository. Confirm visible pages and privacy before adopting
 * any sample as a golden reference. No app/DB/model/cache changes.
 */
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pdfPages} from '../netlify/functions/plan.mjs';
import {choosePdf,findPdfLinks} from '../lib/plan-core.mjs';

export const ORIGINAL_SOURCE_CANDIDATES=Object.freeze([
 {id:'todda-6-w44-2026',school:'todda',grade:'6',year:2026,week:44,
  url:'https://www.minskole.no/DynamicContent//Documents/863-todda-Uke-44-.-c350c815-359d.pdf'},
 {id:'sjostrand-2-w44-2026',school:'sjostrand',grade:'2',year:2026,week:44,
  url:'https://www.minskole.no/DynamicContent//Documents/866-Sjostrand-Ukebrev-uke-44-ca300aa3-539e.pdf'},
 {id:'fagerholt-4-w44-2026',school:'fagerholt',grade:'4',year:2026,week:44,
  url:'https://www.minskole.no/DynamicContent//Documents/854-fagerholt-Ukeplan-uke-44-93c849fa-ad01.pdf'},
 {id:'krossen-3-w45-year-unknown',school:'krossen',grade:'3',year:null,week:45,
  url:'https://www.minskole.no/DynamicContent//Documents/853-krossen-Uke-45-05046a6f-3954.pdf'},
 {id:'lovisenlund-4-w45',school:'lovisenlund',grade:'4',year:null,week:45,
  section:'https://www.minskole.no/lovisenlund/seksjon/21658'},
 {id:'nygaard-4-w45',school:'nygaard',grade:'4',year:null,week:45,
  section:'https://www.minskole.no/nygaard/seksjon/21774'}
]);
const officialHost=new Set(['www.minskole.no','minskole.no','www.minskule.no','minskule.no']);
const safeUrl=(url,{pdf=false}={})=>{
 try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&officialHost.has(u.hostname)&&(!pdf||/\.pdf$/i.test(u.pathname));}
 catch{return false;}
};
export async function officialFetch(url,{fetchImpl=fetch,pdf=false}={}){
 if(!safeUrl(url,{pdf}))throw Error('Source URL is not a permitted official school URL');
 const response=await fetchImpl(url,{redirect:'follow',
  headers:{'User-Agent':'Skoleuka/AI-Quality-Source-Review (+https://github.com/morronetlab/fagerholt)','Accept':pdf?'application/pdf':'text/html'},
  signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Official school HTTP '+response.status);
 if(!safeUrl(response.url||url,{pdf}))throw Error('Untrusted source redirect');
 const max=pdf?14*1024*1024:1_000_000;
 if(Number(response.headers?.get?.('content-length')||0)>max)throw Error('Official source too large');
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length>max)throw Error('Official source too large');
 if(pdf&&new TextDecoder('ascii').decode(bytes.slice(0,4))!=='%PDF')throw Error('Source is not a PDF');
 return bytes;
}
export async function collectOfficialSamples({targets=ORIGINAL_SOURCE_CANDIDATES,fetchImpl=fetch,parsePdf=pdfPages,outDir='quality-originals'}={}){
 mkdirSync(resolve(outDir),{recursive:true});
 const entries=[];
 for(const candidate of targets){
  const meta={id:candidate.id,school:candidate.school,grade:candidate.grade,
   year:candidate.year,week:candidate.week,download:'unverified'};
  try{
   let url=candidate.url;
   if(!url&&candidate.section){
    const html=new TextDecoder().decode(await officialFetch(candidate.section,{fetchImpl}));
    url=choosePdf(findPdfLinks(html,candidate.section,[...officialHost]),candidate.week)?.url;
    if(!url)throw Error('Week PDF not linked by official section');
   }
   if(!safeUrl(url,{pdf:true}))throw Error('Missing or non-official PDF');
   const data=await officialFetch(url,{fetchImpl,pdf:true});
   // A successful text extraction alone is NOT independent visual verification.
   const pages=await parsePdf(data.slice());
   const textTokens=pages.reduce((n,p)=>n+(p.items?.length||0),0);
   const bytes=data.byteLength;
   const sha256=createHash('sha256').update(data).digest('hex');
   const fileName=candidate.id+'.pdf';
   writeFileSync(join(resolve(outDir),fileName),data);
   Object.assign(meta,{download:'downloaded',url,bytes,sha256,
    pages:pages.length,textTokens,
    visualReview:'pending',goldenFactsReview:'pending',
    note:'Official PDF bytes, NOT independently visually reviewed. Do not ingest to model or corpus automatically.',
    fileName});
  }catch(e){
   meta.reason=String(e?.message||e).slice(0,170);
  }
  entries.push(meta);
 }
 const summary={schemaVersion:1,checkedAt:new Date().toISOString(),
  sourceAccess:'read-only official school PDF URLs',
  privacy:'Temporary 1-day CI artifact; no user/family data, PDF text or credentials in logs',
  candidates:targets.length,downloaded:entries.filter(x=>x.download==='downloaded').length,
  entries};
 writeFileSync(join(resolve(outDir),'source-manifest.json'),JSON.stringify(summary,null,2)+'\n');
 return summary;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const outDir=process.argv[2]||'quality-originals';
 const summary=await collectOfficialSamples({outDir});
 // Never print PDF text or contact names.
 console.log('AI SOURCE REVIEW '+JSON.stringify(summary,null,2));
 if(!summary.downloaded)process.exitCode=1;
}