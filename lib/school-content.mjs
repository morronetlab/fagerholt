/** Source-aware helpers for weekly information, homework deadlines and PDF contact cards.
 * No school-specific rules: classifications require relevant headings in the PDF.
 */
import {DAYS} from './calendar.mjs';
const tidy=v=>String(v||'').replace(/\s+/g,' ').trim();
const lower=v=>tidy(v).toLocaleLowerCase('nb-NO');
const wordRx=/\b(?:ukas|ukens|norske|engelske)\s+(?:ord|gloser)|\b(?:øveord|ordliste|gloser)\b/gi;
const dueRx=/\b(?:lekse(?:r|n)?\s*)?til\s+(mandag|tirsdag|onsdag|torsdag|fredag)\b/gi;
const headingRx=/\b(?:lekse(?:r|n)?\s+til\s+(?:mandag|tirsdag|onsdag|torsdag|fredag)|uk[easns]+\s+(?:ord|gloser)|engelske\s+ord|kontaktlærer(?:e)?|beskjeder|informasjon|mandag|tirsdag|onsdag|torsdag|fredag)\b/gi;
export function isWeekwideText(value){
 const text=lower(value);
 return /(?:\b(?:hele|denne|hver)\s+uka\b|\b(?:hele|denne)\s+uken\b|\buken\s+(?:gjennom|over)\b|\bi\s+løpet\s+av\s+uka\b|\b(?:ukas|ukens|uken)\s+(?:tema|ord|gloser|informasjon|fokus|mål)\b|\buk[aesns]+\s+(?:ord|gloser|mål)\b)/i.test(text)
   && !/\b(?:mandag|tirsdag|onsdag|torsdag|fredag)\b/i.test(text);
}
export function shouldBeDayEvent(item){
 return Boolean(tidy(item?.title))&&!isWeekwideText(item.title);
}
export function dueFromQuote(quote){
 const days=[...String(quote||'').matchAll(dueRx)].map(m=>DAYS.find(d=>lower(d)===lower(m[1])));
 return days.length===1?days[0]:null;
}
/** A PDF cell may omit the "Lekser til onsdag" header from its quote. Recover
 * only if the item's own source quotation is located AFTER a nearby header,
 * with no competing homework heading between them.
 */
export function verifiedHomeworkDay(item,pageText=''){
 const direct=dueFromQuote(item?.sourceQuote);
 const pdf=lower(pageText);
 if(!pdf)return null;
 if(direct){
  const quote=lower(item.sourceQuote);
  const day=lower(direct);
  const rx=new RegExp('(?:lekse(?:r|n)?\\s*)?til\\s+'+day+'\\b','i');
  return rx.test(pdf)&&rx.test(quote)?direct:null;
 }
 const quote=lower(item?.sourceQuote);
 if(quote.length<9)return null;
 const candidates=[quote.slice(0,Math.min(72,quote.length)),lower(item?.text).slice(0,48)].filter(x=>x.length>=9);
 const positions=candidates.map(q=>pdf.indexOf(q)).filter(x=>x>=0);
 if(!positions.length)return null;
 const at=positions[0];
 const before=pdf.slice(Math.max(0,at-220),at);
 const matches=[...before.matchAll(headingRx)];
 const last=matches.at(-1);
 if(!last||!/lekse(?:r|n)?\s+til\s+/i.test(last[0]))return null;
 const match=last[0].match(/til\s+(mandag|tirsdag|onsdag|torsdag|fredag)/i);
 return match?DAYS.find(d=>lower(d)===lower(match[1]))||null:null;
}
const headings=/\b(?:ukas|ukens|norske|engelske)\s+(?:ord|gloser)|\b(?:øveord|ordliste|gloser)\b/gi;
export function wordListType(title){
 const t=lower(title);
 if(!/^(?:ukas|ukens|norske|engelske)\s+(?:ord|gloser)$|^(?:øveord|ordliste|gloser)$/i.test(t))return null;
 return /\bengelske\b|\bgloser\b/i.test(t)?'Engelsk':'Norsk';
}
export function recoverWordLists(pageTexts=[],existing=[]){
 const output=[...existing];
 for(let i=0;i<pageTexts.length;i++){
  const page=tidy(pageTexts[i]);
  const hits=[...page.matchAll(headings)];
  for(let j=0;j<hits.length;j++){
   const m=hits[j],title=tidy(m[0]);
   if(output.some(x=>wordListType(x.title)===wordListType(title)&&lower(x.title)===lower(title)))continue;
   const limit=j+1<hits.length?hits[j+1].index:page.length;
   const next=page.slice(m.index+m[0].length,Math.min(limit,m.index+400));
   const end=next.search(/\b(?:lekse(?:r|n)?\s+til\s+\w+|kontaktlærer(?:e)?|læringsmål|beskjeder)\b/i);
   const text=(end>=0?next.slice(0,end):next).replace(/^[\s:–-]+/,'').trim();
   if(text.length<3||text.length>390)continue;
   output.push({title,text,sourcePage:i+1});
  }
 }
 return output.slice(0,10);
}
/** Only show PDF-sourced staff details; never infer email addresses/phone numbers. */
export function verifiedTeacher(item,pageText=''){
 const name=tidy(item?.name),quote=tidy(item?.sourceQuote),page=tidy(pageText);
 if(name.length<4||name.length>100||quote.length<10)return null;
 if(!lower(quote).includes(lower(name)))return null;
 if(page&&!lower(page).includes(lower(name)))return null;
 const role=tidy(item.role);
 if(!/kontaktlærer/i.test(role+' '+quote))return null;
 const email=tidy(item.email);
 const checkedEmail=/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)
  &&lower(quote).includes(lower(email))&&(!page||lower(page).includes(lower(email)))?email:null;
 const phone=tidy(item.phone).replace(/\s+/g,'');
 const checkedPhone=/^(?:\+47)?\d{8}$/.test(phone)&&quote.replace(/\s/g,'').includes(phone)
  &&(!page||page.replace(/\s/g,'').includes(phone))?phone:null;
 return {name,role:role&&/kontaktlærer/i.test(role)?role:'Kontaktlærer',email:checkedEmail,phone:checkedPhone,sourcePage:item.sourcePage};
}
