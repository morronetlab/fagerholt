/** Verify recurring homework days against the specific source quote and PDF text. */
import {DAYS} from './calendar.mjs';
const norm=s=>String(s||'').toLocaleLowerCase('nb-NO').replace(/\s+/g,' ').trim();
const aliases=['man','tir','ons','tor','fre'];
const named=day=>new RegExp('\\b(?:'+day.toLowerCase()+'|'+aliases[DAYS.indexOf(day)]+')(?:dag)?\\b','i');
const indexed=s=>DAYS.filter(day=>named(day).test(s));
const daily=/\b(?:hver\s+(?:(?:skole|uk[e]?)\s*)?dag|daglig|alle\s+(?:skole)?dager|hver\s+dag\s+i\s+uka)\b/i;
const range=/\b(mandag|man|tirsdag|tir|onsdag|ons|torsdag|tor|fredag|fre)\s*(?:-|–|—|til)\s*(mandag|man|tirsdag|tir|onsdag|ons|torsdag|tor|fredag|fre)\b/i;
export function sourceRepeatDays(quote,pageText){
 const q=norm(quote),page=norm(pageText);
 if(!q||!page)return [];
 const repeated=s=>daily.test(s)||range.test(s)||indexed(s).length>=2;
 if(!repeated(q)||!repeated(page))return [];
 const qr=q.match(range),pr=page.match(range);
 const index=v=>DAYS.findIndex((d,i)=>v.toLowerCase()===d.toLowerCase()||v.toLowerCase()===aliases[i]);
 if(qr&&pr){
  const a=index(qr[1]),b=index(qr[2]);
  if(a>=0&&b>=a&&b<5&&index(pr[1])===a&&index(pr[2])===b)return DAYS.slice(a,b+1);
 }
 const quoteDays=indexed(q),pageDays=indexed(page);
 if(quoteDays.length>=2&&quoteDays.every(d=>pageDays.includes(d)))return quoteDays;
 if(daily.test(q)&&daily.test(page)){
  const exceptFriday=/\b(?:unntatt|utenom|bortsett\s+fra|ikke)\s+fredag\b/i;
  return exceptFriday.test(q)&&exceptFriday.test(page)?DAYS.slice(0,4):DAYS;
 }
 return [];
}
export function verifiedRepeatDays(item,pageText){
 const supported=sourceRepeatDays(item?.sourceQuote,pageText);
 if(!supported.length)return [];
 const proposed=Array.isArray(item?.repeatDays)?item.repeatDays:[];
 return proposed.length?DAYS.filter(d=>proposed.includes(d)&&supported.includes(d)):supported;
}

/** Recover repeated reading homework if AI omitted an explicit PDF instruction. */
export function recoverReadingHomework(pageTexts,existing=[]){
 const found=[];
 for(let page=0;page<(pageTexts||[]).length;page++){
  const text=String(pageTexts[page]||'').replace(/\s+/g,' ');
  const cue=/\b(?:leseleks[ea]|lesing|lese\s*lekse|les\s+(?:\d+\s*(?:min|minutter)|(?:\w+\s+){0,5}(?:bok|hver\s+dag|mandag|tirsdag|onsdag|torsdag|fredag)))\b/gi;
  for(const match of text.matchAll(cue)){
   const at=match.index;
   // Do not combine weekdays from unrelated sentences on the same PDF page.
   const prior=text.slice(0,at),lastBoundary=Math.max(prior.lastIndexOf('. '),prior.lastIndexOf('! '),prior.lastIndexOf('? '));
   const start=Math.max(lastBoundary+2,at-24);
   const near=text.slice(start,Math.min(text.length,at+175));
   const boundary=near.search(/[.!?](?:\s|$)/),quote=(boundary>=0?near.slice(0,boundary):near).trim();
   const days=sourceRepeatDays(quote,near);
   if(days.length<2)continue;
   if(existing.some(h=>Array.isArray(h.repeatDays)&&h.repeatDays.length>=2&&/les/i.test(h.text||'')))continue;
   if(found.some(x=>x.sourcePage===page+1&&x.repeatDays.join()===days.join()))continue;
   const instruction=quote.slice(Math.max(0,at-Math.max(0,at-24))).trim().slice(0,150);
   found.push({subject:'Lesing',text:instruction||'Leselekse',dueDay:null,repeatDays:days,sourcePage:page+1,sourceQuote:quote});
  }
 }
 return found.slice(0,5);
}
