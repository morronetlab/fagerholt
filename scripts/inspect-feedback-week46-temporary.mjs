/** Temporary read-only source probe for the four user-submitted week-46 reports.
 * Only sanitized snippets and PDF token positions go to CI logs.
 * No PDF bytes or teacher contact information are committed to Git.
 */
import {pdfPages} from '../netlify/functions/plan.mjs';
import {officialFetch} from './collect-quality-originals.mjs';
const samples=[
 {key:'wildsminne-7-w46',url:'https://www.minskole.no/DynamicContent//Documents/870-wildsminne-Uke-46-(4)-523be8af-d25e.pdf'},
 {key:'sjostrand-2-w46',url:'https://www.minskole.no/DynamicContent//Documents/866-Sjostrand-Ukebrev-uke-46-51d394b5-3078.pdf'},
 {key:'fagerholt-3-w46',url:'https://www.minskole.no/DynamicContent//Documents/854-fagerholt-Ukeplan-uke-46-6985c209-3121.pdf'}
];
const safe=s=>String(s||'').replace(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/giu,'[REDACTED_EMAIL]')
 .replace(/(?<!\d)(?:\+47\s*)?(?:\d[\s-]*){8,11}(?!\d)/gu,'[REDACTED_PHONE]')
 .replace(/\s+/gu,' ').trim().slice(0,170);
const re=/lekse|les(?:e)?|tirsdag|onsdag|torsdag|fredag|mandag|bål|ved|bamse|pakke|ta med|kontakt|e-?post|telefon/i;
for(const item of samples){
 try{
  const bytes=await officialFetch(item.url,{pdf:true});
  const pages=await pdfPages(bytes);
  console.log('SOURCE '+JSON.stringify({key:item.key,bytes:bytes.length,pages:pages.length}));
  for(let pageIndex=0;pageIndex<pages.length;pageIndex++){
   const p=pages[pageIndex];
   const relevant=(p.items||[]).map((t,i)=>({t,i})).filter(({t})=>re.test(String(t.text||''))).slice(0,45);
   for(const {t,i} of relevant){
    const peers=(p.items||[]).filter(x=>Math.abs(x.y-t.y)<9&&Math.abs(x.x-t.x)<Math.max(100,p.width*.43));
    const nearby=peers.length?peers.map(x=>x.text).join(' '):t.text;
    console.log('ROW '+JSON.stringify({key:item.key,page:pageIndex+1,token:i,x:Math.round(t.x),y:Math.round(t.y),text:safe(nearby)}));
   }
  }
 }catch(error){console.log('SOURCE_ERROR '+JSON.stringify({key:item.key,error:String(error?.message||error).slice(0,130)}));}
}
