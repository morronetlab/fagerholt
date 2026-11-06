import {createHash} from 'node:crypto';
import {ORIGINAL_PDF_GOLDENS} from '../tests/quality/original-pdf-goldens.mjs';
import {pdfPages} from '../netlify/functions/plan.mjs';
import {linesFromPage,analyzePdfPages} from '../lib/plan-core.mjs';
const names=new Set(['lovisenlund-4-w45-2026','nygaard-4-w45-2026','fagerholt-4-w44-2026']);
for(const g of ORIGINAL_PDF_GOLDENS.filter(x=>names.has(x.id))){
 const r=await fetch(g.url);if(!r.ok)throw Error(g.id+': HTTP '+r.status);
 const bin=new Uint8Array(await r.arrayBuffer());
 if(createHash('sha256').update(bin).digest('hex')!==g.sha256)throw Error('SHA changed '+g.id);
 const pages=await pdfPages(bin);
 const plan=analyzePdfPages(pages,g.grade,g.url,g.week,g.year,'https://www.minskole.no/'+g.school+'/');
 console.log('SOURCE '+g.id+' pageCount='+pages.length+
  ' notices='+plan.notices.filter(x=>/planlegging|stengt|skolefri/i.test(x)).length+
  ' ThursdayBring='+(plan.days?.Torsdag?.bring?.length||0));
 for(const [idx,p] of pages.entries()){
  const joined=p.items.map(i=>i.text).join(' ').replace(/\s+/g,' ');
  const rx=/planleggingsdag\w*|skolen\s+(?:er\s+)?stengt|skolefri|\bstengt\b/gi;
  const redact=s=>s.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,'[email]').replace(/\b\d{8}\b/g,'[phone]');
  for(const m of [...joined.matchAll(rx)].slice(0,12)){
   let frag=redact(joined.slice(Math.max(0,m.index-85),Math.min(joined.length,m.index+145)));
   console.log('FRAG '+g.id+' p'+(idx+1)+' '+JSON.stringify(frag));
  }
  for(const line of linesFromPage(p).filter(x=>rx.test(x.text)).slice(0,7)){
   rx.lastIndex=0;
   console.log('LINE '+g.id+' p'+(idx+1)+' '+JSON.stringify(redact(line.text.slice(0,220))));
  }
 }
}