/** Honest, extractive digest for public school notices.
 * Any AI-selected short text must be copied from the existing notice:
 * no new dates, obligations, free days or gear can enter through this view.
 */
import {DAYS,dayDate} from './calendar.mjs';
import {adultImpactType} from './adult-impact.mjs';

const compact=value=>String(value??'').normalize('NFKC').replace(/\s+/gu,' ').trim();
const norm=value=>compact(value).toLocaleLowerCase('nb-NO');
const weekdayPattern=/\b(mandag|tirsdag|onsdag|torsdag|fredag)\b/giu;
const dayPrefix=/^(?:mandag|tirsdag|onsdag|torsdag|fredag)\s*[:–-]\s*/iu;
const dateFormatter=new Intl.DateTimeFormat('nb-NO',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});
const practicalWords=/\b(?:planleggingsdag|fridag|skolefri|stengt|slutter|starter|vaksin\w*|foreldremøte|påmelding|samtykke|frist|hent\w*|lever\w*|ta med|husk|oppmøte|svømm|tur|utflukt)\b/iu;

/** A short model excerpt must be an actual uninterrupted span of the original.
 * An extract may not remove the only words explaining a school closure/vaccine.
 */
export function verifiedDigestExcerpt(original,candidate,max=155){
 const full=compact(original),short=compact(candidate);
 if(!short||short.length<14||short.length>max||short.length>=full.length||
  !norm(full).includes(norm(short)))return null;
 const impact=adultImpactType(full);
 if(impact&&adultImpactType(short)!==impact)return null;
 if(practicalWords.test(full)&&!practicalWords.test(short))return null;
 return short;
}
function textSpan(original,max=155){
 const full=compact(original).replace(dayPrefix,'');
 if(full.length<=max)return full;
 // Prioritize the source sentence containing the actionable information.
 const segments=full.split(/(?<=[.!?])\s+|;\s+/u).filter(Boolean);
 const impact=adultImpactType(full);
 const relevant=segments.find(part=>impact&&adultImpactType(part)===impact)||
  segments.find(part=>practicalWords.test(part))||segments[0]||full;
 const short=relevant.length<=max?relevant:relevant.slice(0,max+1).replace(/\s+\S*$/u,'').trim();
 return short+(short.length<full.length?' …':'');
}
export function schoolNoticeDate(item,year,week){
 if(!Number.isInteger(year)||!Number.isInteger(week)||week<1||week>53)return null;
 const original=compact(item?.label);
 const explicit=DAYS.includes(item?.day)?item.day:null;
 // A future date from an unrelated week must never be assigned this week's weekday.
 if(/\b(?:neste|forrige)\s+uke\b/iu.test(original))return null;
 const mentionedWeek=original.match(/\buke\s+(\d{1,2})\b/iu);
 if(mentionedWeek&&Number(mentionedWeek[1])!==week)return null;
 const days=[...original.matchAll(weekdayPattern)].map(match=>
  DAYS.find(day=>norm(day)===norm(match[1])));
 const distinct=[...new Set(days)];
 if(distinct.length>1)return null;
 if(explicit&&distinct.length&&distinct[0]!==explicit)return null;
 const chosen=explicit||distinct[0]||null;
 if(!chosen)return null;
 return dayDate(year,week,DAYS.indexOf(chosen));
}
export function sourcePdfLink(pdf,page){
 try{
  const url=new URL(pdf);
  if(url.protocol!=='https:'||url.username||url.password||
    !['minskole.no','www.minskole.no','minskule.no','www.minskule.no'].includes(url.hostname)||
    !/\.pdf$/iu.test(url.pathname))return null;
  url.hash=Number.isInteger(page)&&page>0&&page<=100?'page='+page:'';
  return url.href;
 }catch{return null;}
}
export function practicalDigest(item,{year,week,pdf}={}){
 const original=compact(item?.label);
 const ai=verifiedDigestExcerpt(original,item?.aiShortText);
 const display=ai||textSpan(original);
 const date=schoolNoticeDate(item,year,week);
 return {
  shortText:display.replace(dayPrefix,''),
  fullText:original,
  sourceQuote:compact(item?.sourceQuote)||null,
  sourcePage:Number.isInteger(item?.sourcePage)?item.sourcePage:null,
  date,
  dateLabel:date?dateFormatter.format(new Date(date+'T12:00:00Z')):null,
  pdfUrl:sourcePdfLink(pdf,item?.sourcePage)
 };
}
