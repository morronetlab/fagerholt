/** Verify recurring homework days against the specific source quote and PDF text. */
import {DAYS} from './calendar.mjs';
const norm=s=>String(s||'').toLocaleLowerCase('nb-NO').replace(/\s+/g,' ').trim();
const aliases=['man','tir','ons','tor','fre'];
const named=day=>new RegExp('\\b(?:'+day.toLowerCase()+'|'+aliases[DAYS.indexOf(day)]+')(?:dag)?\\b','i');
const indexed=s=>DAYS.filter(day=>named(day).test(s));
const daily=/\b(?:hver\s+(?:skole)?dag|daglig|alle\s+(?:skole)?dager)\b/i;
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
 if(daily.test(q)&&daily.test(page))return DAYS;
 return [];
}
export function verifiedRepeatDays(item,pageText){
 const supported=sourceRepeatDays(item?.sourceQuote,pageText);
 if(!supported.length)return [];
 const proposed=Array.isArray(item?.repeatDays)?item.repeatDays:[];
 return proposed.length?DAYS.filter(d=>proposed.includes(d)&&supported.includes(d)):supported;
}
