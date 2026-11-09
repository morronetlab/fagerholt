/** Temporary read-only source probe for the four user-submitted week-46 reports.
 * Only sanitized snippets and PDF token positions go to CI logs.
 * No PDF bytes or teacher contact information are committed to Git.
 */
import {pdfPages} from '../netlify/functions/plan.mjs';
import {officialFetch} from './collect-quality-originals.mjs';
import {extractExplicitSchoolPacking} from '../lib/packing-source.mjs';
import {extractHomeworkDeadlineCells} from '../lib/homework-grid.mjs';
import {analyzePdfPages} from '../lib/plan-core.mjs';
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
  const grade=item.key.startsWith('wildsminne')?'7':item.key.startsWith('sjostrand')?'2':'3';
  const plan=analyzePdfPages(pages,grade,item.url,46,2026,item.url);
  const sourcePacking=extractExplicitSchoolPacking(pages);
  const homeworkCells=extractHomeworkDeadlineCells(pages);
  console.log('VERIFIED_CHECK '+JSON.stringify({
   key:item.key,
   originalSourcePacking:sourcePacking.map(x=>({day:x.day,label:x.label})),
   resultingPacking:Object.entries(plan.days).flatMap(([day,v])=>v.bring.map(x=>({day,label:x.label})))
    .filter(x=>/bålmat|vedkubbe|bamse|gymsko/i.test(x.label)),
   extractedHomework:homeworkCells.map(x=>({day:x.dueDay,subject:x.subject,text:safe(x.text)})).slice(0,12),
   resultingHomework:plan.homework.map(x=>({day:x.dueDay,repeatDays:x.repeatDays,subject:x.subject,text:safe(x.text)})).slice(0,12)
  }));

  const itemText=plan.homework.map(x=>String(x.text||'').toLowerCase());
  const gear=Object.entries(plan.days).flatMap(([day,v])=>v.bring.map(x=>({day,label:x.label})));
  const found=(day,word)=>gear.some(x=>x.day===day&&x.label.toLowerCase().includes(word));
  let passing=true;
  if(item.key==='wildsminne-7-w46')passing=
   found('Fredag','bamse')&&
   !itemText.some(x=>x.includes('minskole.no/wildsminne'))&&
   itemText.some(x=>x.includes('valgfri bok'));
  if(item.key==='fagerholt-3-w46')passing=
   found('Mandag','bålmat')&&found('Mandag','vedkubbe');
  if(item.key==='sjostrand-2-w46'){
   const count=plan.homework.filter(x=>/tell.*40/i.test(x.text));
   passing=found('Fredag','gymsko')&&
    plan.homework.some(x=>/les s|les.*fabel/i.test(x.text)&&!x.dueDay)&&
    plan.homework.some(x=>/eget ark/i.test(x.text)&&!x.dueDay)&&
    count.some(x=>x.repeatDays?.join('|')==='Onsdag|Torsdag')&&
    !itemText.some(x=>x.includes('kontaktlærere'));
  }
  console.log('SOURCE_ACCEPTANCE '+JSON.stringify({key:item.key,pass:passing}));
  if(!passing)process.exitCode=1;
 }catch(error){console.log('SOURCE_ERROR '+JSON.stringify({key:item.key,error:String(error?.message||error).slice(0,130)}));}
}
