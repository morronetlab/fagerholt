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

/**
 * A PDF may say "Leselekse: Les hver dag" while the model quotes only
 * "Les i boka". Recover repetition from the *same reading instruction*,
 * not from unrelated weekday mentions elsewhere in the timetable.
 */
const readingCue=/\b(?:leseleks[ea]|lesing|lese\s*lekse|les\s+(?:\d+\s*(?:min(?:utter)?|sider?)|i\s+(?:boka?|boken|bok)|hver\s+dag))\b/i;
const sentenceParts=text=>String(text||'').replace(/\s+/g,' ').split(/(?<=[.!?])\s+|\s*[•\n]\s*/).map(x=>x.trim()).filter(Boolean);
export function recoverReadingHomework(pageTexts,existing=[]){
 const recovered=[];
 for(let page=0;page<(pageTexts||[]).length;page++){
  const full=String(pageTexts[page]||'');
  for(const sentence of sentenceParts(full)){
   if(!readingCue.test(sentence))continue;
   const days=sourceRepeatDays(sentence,sentence);
   if(days.length<2)continue;
   const candidates=existing.filter(h=>/les|bok/i.test((h.subject||'')+' '+(h.text||'')));
   // Attach to the existing homework item when its text appears in the
   // instruction; never create an unrelated second reading task.
   const normalize=x=>String(x||'').toLocaleLowerCase('nb-NO').replace(/[^a-zæøå0-9]+/g,' ').trim();
   const matched=candidates.find(h=>{
    const words=normalize(h.text).split(' ').filter(w=>w.length>=4);
    const haystack=normalize(sentence);
    return words.length>0&&words.filter(w=>haystack.includes(w)).length>=Math.max(1,Math.ceil(words.length*.5));
   });
   if(matched){
    if(!matched.repeatDays?.length)matched.repeatDays=days;
    continue;
   }
   if(candidates.length||recovered.some(x=>x.sourcePage===page+1&&x.repeatDays.join()===days.join()))continue;
   recovered.push({subject:'Lesing',text:sentence.slice(0,180),dueDay:null,repeatDays:days,sourcePage:page+1,sourceQuote:sentence.slice(0,260)});
  }
 }
 return recovered.slice(0,5);
}
