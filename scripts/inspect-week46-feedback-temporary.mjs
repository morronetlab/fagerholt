import {pdfPages} from '../netlify/functions/plan.mjs';
import {officialFetch} from './collect-quality-originals.mjs';
import {analyzePdfPages} from '../lib/plan-core.mjs';
import {extractHomeworkEvidenceCells} from '../lib/homework-source-truth.mjs';
import {extractExplicitSchoolPacking} from '../lib/packing-source.mjs';
const candidates=[
 ['lovisenlund','5','https://www.minskole.no/DynamicContent//Documents/858-lovisenlund-Uke-46-c1f9921b-2535.pdf'],
 ['hellemyr','3','https://www.minskole.no/DynamicContent//Documents/868-hellemyr-Uke-46-(2)-ac200d08-6dd7.pdf'],
 ['wildsminne','2','https://www.minskole.no/DynamicContent//Documents/870-wildsminne-Lekseplan-uke-46-1acf17bd-142d.pdf'],
 ['sjostrand','2','https://www.minskole.no/DynamicContent//Documents/866-Sjostrand-Ukebrev-uke-46-51d394b5-3078.pdf']
];
function scrub(s){
 return String(s||'').replace(/[\p{L}\p{N}.+_-]+@[\p{L}\p{N}.-]+\.[a-z]{2,}/giu,'[EMAIL]')
 .replace(/(?<!\d)(?:\+47[\s-]*)?(?:\d[\s-]*){8,11}(?!\d)/gu,'[PHONE]').slice(0,210);
}
for(const [school,grade,url] of candidates){
 try{
  const pdf=await officialFetch(url,{pdf:true});const pages=await pdfPages(pdf);
  const plan=analyzePdfPages(pages,grade,url,46,2026,url);
  console.log('PLAN '+JSON.stringify({school,grade,pages:pages.length,
   days:Object.fromEntries(Object.entries(plan.days).map(([day,x])=>[day,{events:x.events.map(e=>scrub(e.title)),bring:x.bring.map(e=>e.label)}])),
   homework:plan.homework.map(x=>({day:x.dueDay,repeat:x.repeatDays,subject:x.subject,text:scrub(x.text)}))
  }));
  console.log('SOURCEPACK '+JSON.stringify({school,packing:extractExplicitSchoolPacking(pages).map(x=>({day:x.day,label:x.label}))}));
  console.log('SOURCEHOME '+JSON.stringify({school,cells:extractHomeworkEvidenceCells(pages).map(x=>({day:x.dueDay,subject:x.subject,text:scrub(x.text)})).slice(0,25)}));
  const terms=/gym|såpe|håndkle|lekse|les|tirsdag|onsdag|torsdag|fredag|pakk|ta med|penal|norsk|husk|skole|beskjed|matte/iu;
  for(let i=0;i<pages.length;i++){
   const p=pages[i];
   const rows=[];
   for(const x of [...(p.items||[])].sort((a,b)=>a.y-b.y||a.x-b.x)){
    let row=rows.at(-1);if(row&&Math.abs(row.y-x.y)<=3)row.items.push(x);
    else rows.push({y:x.y,items:[x]});
   }
   for(const row of rows){
    const text=row.items.sort((a,b)=>a.x-b.x).map(x=>x.text).join(' ');
    if(!terms.test(text))continue;
    console.log('PDFROW '+JSON.stringify({school,page:i+1,y:Math.round(row.y),x:Math.round(Math.min(...row.items.map(x=>x.x))),text:scrub(text)}));
   }
  }
 }catch(error){console.log('FAIL '+JSON.stringify({school,error:String(error.message||error)}));process.exitCode=1;}
}
