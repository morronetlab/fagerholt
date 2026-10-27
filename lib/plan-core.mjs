/** Extract only what is supported by the official PDF. Unknown fields stay empty. */
import {DAYS} from './calendar.mjs';
export {DAYS};
const norm = value => String(value??'').replace(/[\u0000-\u001f\u00ad]/g,' ').replace(/\s+/g,' ').trim();
const limited=(value,size=420)=>norm(value).slice(0,size);
const SECTION_PATTERN=/^(?:(?:tema\s*[-–]\s*dette jobber vi med denne uka)|ukeplan|lekser?(?:\s+(?:denne\s+uken|uke\s*\d{1,2}))?|hjemmearbeid|lekseplan|beskjeder(?: fra skolen)?|informasjon(?: til foresatte|\s+uke\s*\d{1,2})?|læringsmål|læringsmal|ukas tema|ukens tema|tema for uka|frivillig oppdrag|ukas oppdrag|ukens oppdrag|dette skjer(?: fremover)?|huskeliste|husk|viktig informasjon)\s*:?$/i;
const namedSection=(line)=>{
  const t=norm(line).replace(/[:\s]+$/,'').toLowerCase();
  if (/^(lekse|lekser|lekseplan|hjemmearbeid)/.test(t))return 'homework';
  if (/^(læringsmål|læringsmal)/.test(t))return 'learningGoals';
  if (/^tema\s*[-–]\s*dette jobber vi med denne uka/.test(t))return 'subjects';
  if (/^(tema|ukas tema|ukens tema|tema for uka|periode)/.test(t))return 'weekTheme';
  if (/^(frivillig oppdrag|ukas oppdrag|ukens oppdrag)/.test(t))return 'optionalMission';
  if (/^(beskjeder|informasjon|dette skjer|viktig informasjon)/.test(t))return 'notices';
  if (/^(husk|huskeliste)$/.test(t))return 'packing';
  return null;
};
const htmlDecode=s=>s.replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&nbsp;/gi,' ').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
/** Accept only PDFs for the selected week, never a previous week's PDF. */
export function findPdfLinks(html,sectionUrl,allowedHosts=['www.minskole.no','minskole.no']) {
  const links=[];
  const rx=/<a\b([^>]*\bhref\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*)>([\s\S]*?)<\/a>/gi;
  for(const a of String(html).matchAll(rx)){
    const m=a[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if(!m)continue;
    let url;
    try{url=new URL(htmlDecode(m[1]||m[2]||m[3]),sectionUrl);}catch{continue;}
    if(url.protocol!=='https:'||url.username||url.password||!allowedHosts.includes(url.hostname)||!/\.pdf$/i.test(url.pathname))continue;
    const label=norm(htmlDecode(a[2].replace(/<[^>]*>/g,' ')));
    const wm=(label+' '+decodeURIComponent(url.pathname)).match(/\buke(?:plan)?[\s.\-_]*(?:uke[\s.\-_]*)?(\d{1,2})(?!\d)/i);
    if(!wm)continue;
    const week=Number(wm[1]);if(week<1||week>53)continue;
    links.push({label,url:url.toString(),week});
  }
  return [...new Map(links.map(x=>[x.url,x])).values()];
}
export function choosePdf(links,week) {return links.find(x=>x.week===week)||null;}

/** Normalised PDF.js items use x/y from upper left; contents remain source-only. */
export function pdfItemsFromTextContent(content,width,height){
  return {width,height,items:(content.items||[]).filter(i=>typeof i.str==='string'&&norm(i.str)).map(i=>({
    text:limited(i.str,800),x:Number(i.transform?.[4])||0,y:height-(Number(i.transform?.[5])||0),width:Number(i.width)||0
  }))};
}
export function linesFromPage(page){
  const tokens=[...(page.items||[])].filter(x=>norm(x.text)).sort((a,b)=>Math.abs(a.y-b.y)<3 ? a.x-b.x : a.y-b.y);
  const lines=[];
  for(const token of tokens){
    const last=lines.at(-1);
    if(last&&Math.abs(last.y-token.y)<3&&token.x>=last.endX-4){
      last.text+= (/[-\s]$/.test(last.text)||/^[.,:!?)]/.test(token.text)?'':' ') + token.text;
      last.endX=Math.max(last.endX,token.x+token.width);
    }else lines.push({x:token.x,y:token.y,endX:token.x+token.width,text:token.text});
  }
  return lines.map(x=>({...x,text:norm(x.text)}));
}
function textSegments(pages){
  const out=[];let current=null;
  for(const page of pages){
    for(const row of linesFromPage(page)){
      const line=norm(row.text);
      // The school places a multi-column day table between homework and notices.
      // A table header must end any free-text extraction section.
      if ((/\bmandag\b/i.test(line)&&/\btirsdag\b/i.test(line)&&/\bfredag\b/i.test(line)) ||
          /^oversikt\s*\/\s*huskeliste/i.test(line) || /^ukeplan for\b/i.test(line)){
        current=null;continue;
      }
      const inline=line.match(/^(Tema|Periode)\s*[:=]\s*(.+)$/i);
      if(inline){out.push({section:'weekTheme',text:limited(inline[2],250)});current=null;continue;}
      if(SECTION_PATTERN.test(line)){
        const next=namedSection(line);
        if(next){current=next;continue;}
        if(/^ukeplan$/i.test(line)) {current=null;continue;}
      }
      if(current&&line&&line.length>1)out.push({section:current,text:limited(line,450)});
    }
  }
  return out;
}
function extractColumns(page){
  const rows=page.items||[];const markers=[];
  for(const token of rows){
    for(let i=0;i<5;i++)if(new RegExp('^'+DAYS[i]+'(?:\\b|\\s|\\d)','i').test(norm(token.text))){markers.push({i,x:token.x,y:token.y});break;}
  }
  for(const m of markers.filter(x=>x.i===0).sort((a,b)=>a.y-b.y)){
    const row=[m];
    for(let i=1;i<5;i++){
      const match=markers.filter(x=>x.i===i&&Math.abs(x.y-m.y)<17&&x.x>row.at(-1).x+12).sort((a,b)=>Math.abs(a.y-m.y)-Math.abs(b.y-m.y))[0];
      if(!match)break;row.push(match);
    }
    if(row.length!==5)continue;
    const top=Math.max(...row.map(x=>x.y))+8;
    const sectionAfter=rows.filter(x=>x.y>top+15&&SECTION_PATTERN.test(norm(x.text)));
    const bottom=Math.min(page.height-3,...sectionAfter.map(x=>x.y-5));
    if(bottom<=top+10)continue;
    const results={};
    for(let i=0;i<5;i++){
      const a=row[i].x-8,b=i<4?row[i+1].x-8:page.width;
      results[DAYS[i]]=linesFromPage({items:rows.filter(x=>x.x>=a&&x.x<b&&x.y>=top&&x.y<bottom)}).map(x=>limited(x.text,270)).filter(Boolean);
    }
    return results;
  }
  return null;
}
function verticalDayLists(pages){
  const values=Object.fromEntries(DAYS.map(x=>[x,[]]));
  for(const page of pages){
    let day=null;
    for(const line of linesFromPage(page).map(x=>x.text)){
      const i=DAYS.findIndex(d=>new RegExp('^'+d+'(?:\\s+\\d{1,2}[./]\\d{1,2})?\\s*:?$','i').test(line));
      if(i>=0){day=DAYS[i];continue;}
      if(SECTION_PATTERN.test(line))day=null;
      if(day&&line)values[day].push(limited(line,260));
    }
  }
  return values;
}
function uniqueValues(values){return [...new Set(values.map(x=>limited(x)).filter(Boolean))];}
function parseDay(lines){
  const events=[],bring=[];
  for(const s of uniqueValues(lines)){
    if(/^(?:ta med|husk å ta med|i sekken)\s*:/i.test(s)){
      const gear=s.replace(/^[^:]+:/,'').split(/[,;]|\s+og\s+/i).map(x=>limited(x,100)).filter(Boolean);
      for(const item of gear)bring.push({label:item[0].toLocaleUpperCase('nb-NO')+item.slice(1)});
      continue;
    }
    if(/^[-–•]?$/.test(s))continue;
    const time=s.match(/\b(?:kl\.?\s*)?(\d{1,2}[.:]\d{2})(?:\s*[-–]\s*(\d{1,2}[.:]\d{2}))?/);
    events.push({title:s,time:time?time[0]:null});
  }
  return {events,bring:[...new Map(bring.map(x=>[x.label.toLocaleLowerCase('nb-NO'),x])).values()]};
}

/** Columns and row boundaries come from the PDF's actual text coordinates, never guessed subjects. */
function rectLines(page,left,right,top,bottom){
  return linesFromPage({...page,items:(page.items||[]).filter(t=>t.x>=left&&t.x<right&&t.y>=top&&t.y<bottom)})
    .map(row=>norm(row.text)).filter(Boolean);
}
function isDayToken(text){return DAYS.findIndex(day=>new RegExp('^'+day+'(?=\\s|$|[:.,])','i').test(norm(text)));}
function isHomeworkHeading(text){return /^(?:i lekse|hjemmelekse|hjemmeoppgaver?|ukelekse|lekser? til|ukas utfordringer|ukens utfordringer|hjemmearbeid)\b/i.test(norm(text));}

/** Fagerholt grade 5 PDF: three columns "Dag | På skolen | I lekse", with days as rows. */
export function extractDayRows(pages){
  for(const page of pages){
    const tokens=page.items||[];
    const classroom=tokens.find(t=>/^på skolen\b/i.test(norm(t.text)));
    const lesson=tokens.find(t=>/^i lekse\b/i.test(norm(t.text)));
    const dayHeading=tokens.find(t=>/^dag$/i.test(norm(t.text)));
    if(!classroom||!lesson||classroom.x>=lesson.x||Math.abs(classroom.y-lesson.y)>16)continue;
    if(dayHeading&&Math.abs(dayHeading.y-classroom.y)>16)continue;
    const startX=classroom.x-10,hwX=lesson.x-10;
    const firstColMax=Math.min(startX,page.width*.42);
    const markers=tokens.map(t=>({...t,dayIndex:isDayToken(t.text)}))
      .filter(t=>t.dayIndex>=0&&t.x<firstColMax&&t.y>classroom.y+6)
      .sort((a,b)=>a.y-b.y);
    const found=new Map();
    for(const marker of markers)if(!found.has(marker.dayIndex))found.set(marker.dayIndex,marker);
    if(found.size<3)continue;
    const sorted=[...found.values()].sort((a,b)=>a.y-b.y);
    const days=Object.fromEntries(DAYS.map(x=>[x,[]]));
    const homework=[];
    sorted.forEach((m,index)=>{
      const bottom=index<sorted.length-1?sorted[index+1].y-2:page.height-5;
      const top=m.y-2;
      days[DAYS[m.dayIndex]]=rectLines(page,startX,hwX,top,bottom);
      homework.push(...rectLines(page,hwX,page.width-2,top,bottom));
    });
    return {days,homework,layout:'day-rows'};
  }
  return null;
}
/** Day sections: "Mandag på skolen" and "Hjemmelekse mandag" in a single-column PDF. */
export function extractDaySections(pages){
  const days=Object.fromEntries(DAYS.map(d=>[d,[]]));
  const homework=[];
  let matched=0;
  for(const page of pages){
    let current=null,kind=null;
    const items=linesFromPage(page).map(x=>x.text);
    for(const line of items){
      const school=line.match(/^(Mandag|Tirsdag|Onsdag|Torsdag|Fredag)\s+(?:på\s+skolen|i\s+skolen)\b/i);
      const hw=line.match(/^(?:Hjemmelekse|Lekser?\s+til|Lekser?)\s+(Mandag|Tirsdag|Onsdag|Torsdag|Fredag)\b/i);
      if(school||hw){current=DAYS.find(x=>x.toLowerCase()===(school||hw)[1].toLowerCase());kind=school?'school':'homework';matched++;continue;}
      if(/^(?:dagsrytme|informasjon|kontakt|læringsmål|beskjeder|mål)\b/i.test(line)){current=null;kind=null;continue;}
      if(current&&kind==='school'&&line)days[current].push(limited(line,300));
      if(current&&kind==='homework'&&line)homework.push(limited(line,400));
    }
  }
  return matched>=3?{days,homework,layout:'day-sections'}:null;
}
/** Row subjects / column weekdays, e.g. "Ukas utfordringer" / "Lekser til". */
export function extractHomeworkGrid(pages){
  const homework=[];
  for(const page of pages){
    const tokens=page.items||[];
    const heading=tokens.find(t=>/^(?:ukas utfordringer|ukens utfordringer|lekser til|lekser til:)$/i.test(norm(t.text)));
    if(!heading)continue;
    const dayHeaders=tokens.filter(t=>t.y>=heading.y-12&&t.y<heading.y+46&&/^(?:til\s+)?(?:tirsdag|onsdag|torsdag|fredag)\b/i.test(norm(t.text)))
      .sort((a,b)=>a.x-b.x);
    if(dayHeaders.length<2)continue;
    const split=dayHeaders[0].x-10;
    const bottom=Math.min(page.height-4,...tokens.filter(t=>t.y>heading.y+60&&/^(?:læringsmål|mål:|beskjeder|informasjon|hilsen)\b/i.test(norm(t.text))).map(t=>t.y-3));
    for(let i=0;i<dayHeaders.length;i++){
      const day=norm(dayHeaders[i].text).replace(/^til\s+/i,'');
      const right=i+1<dayHeaders.length?dayHeaders[i+1].x-8:page.width-3;
      for(const text of rectLines(page,dayHeaders[i].x-8,right,heading.y+17,bottom)){
        if(text.length>2&&!/^(?:til\s+)?(?:tirsdag|onsdag|torsdag|fredag)$/i.test(text)) homework.push(`Til ${day.toLowerCase()}: ${text}`);
      }
    }
    // Preserve subject-labelled assignments in the first column where present.
    const labels=rectLines(page,Math.max(0,heading.x-5),split,heading.y+17,bottom);
    for(const label of labels)if(/^(?:norsk|engelsk|matematikk|matte|naturfag|krle|samfunnsfag)\s*:/i.test(label))homework.push(label);
  }
  return homework;
}

const GEAR_TERMS=[
  ['gymtøy',/\b(?:gymtøy|gymklær|treningstøy)\b/i],
  ['Gymsko',/\b(?:gymsko|innesko)\b/i],
  ['Dusjetøy',/\b(?:dusjetøy|dusjutstyr)\b/i],
  ['Håndkle',/\bhåndkle\b/i],
  ['Badetøy',/\b(?:badetøy|badebukse|badedrakt)\b/i],
  ['Hårstrikk',/\bhårstrikk\b/i],
  ['Forkle',/\bforkle\b/i],
  ['Mat og helse-hefte',/\bmat og helse[- ]heft\w*\b/i],
  ['Chromebook',/\bchromebook\b/i],
  ['Glosebok',/\bglosebok\b/i],
];
function gearFromStatement(line){
  // Only positive, explicit packing instructions; mentioning a subject alone is not enough.
  if(!/(?:\bhusk\b|\bta\s+med\b|\bha\s+med\b|\bi\s+sekken\b|\bpakk\b|\b(?:gym|dusj)utstyr\s*:|\b(?:gym|dusje?)tøy\s*:)/i.test(line))return [];
  const result=[];
  for(const [label,re] of GEAR_TERMS)if(re.test(line))result.push({label:label==='gymtøy'?'Gymtøy':label});
  const m=line.match(/(?:\bta\s+med\b|\bi\s+sekken\b|\bpakk\b)\s*:\s*(.*)/i);
  if(m)for(const chunk of m[1].split(/[,;]|\s+og\s+/i)){
    const part=limited(chunk,100).replace(/[.!]+$/,'');
    if(part&&part.length<70&&!/\b(?:dersom|hvis|til\s+skolen\s+på)\b/i.test(part))result.push({label:part});
  }
  return [...new Map(result.map(x=>[x.label.toLowerCase(),x])).values()];
}
function gearForPlan(days,segments){
  const everyday=[];
  for(const line of segments.filter(s=>s.section==='packing').map(s=>s.text))everyday.push(...gearFromStatement(line));
  for(const day of DAYS){
    for(const event of days[day].events)days[day].bring.push(...gearFromStatement(event.title));
    days[day].bring=[...new Map(days[day].bring.map(item=>[item.label.toLowerCase(),item])).values()];
  }
  return [...new Map(everyday.map(x=>[x.label.toLowerCase(),x])).values()];
}
function parseHomework(lines){
  // Keep full PDF wording. Join wrapped continuations rather than creating fake separate tasks.
  const tasks=[];
  for(const line of lines){
    const t=limited(line,420);if(!t||/^(?:dag|på skolen|i lekse)$/i.test(t))continue;
    const m=t.match(/^((?:norsk|engelsk|matematikk|matte|naturfag|krle|samfunnsfag|lesing(?:\/engelsk)?|ukelekse|til\s+(?:mandag|tirsdag|onsdag|torsdag|fredag))):\s*(.*)$/i);
    if(m){tasks.push({subject:m[1],text:t});continue;}
    const previous=tasks.at(-1);
    if(previous&&previous.text.length<400&&!/^[•*\-]/.test(t)){
      previous.text=limited(previous.text+' '+t,420);
    }else tasks.push({subject:null,text:t});
  }
  return [...new Map(tasks.map(t=>[t.text.toLowerCase(),t])).values()];
}

export function analyzePdfPages(pages,grade,pdf,week,year,source){
  const segments=textSegments(pages);
  const select=(key)=>uniqueValues(segments.filter(x=>x.section===key).map(x=>x.text));
  let columns=null;
  for(const p of pages){const candidate=extractColumns(p);if(candidate){columns=candidate;break;}}
  const rowLayout=extractDayRows(pages);
  const sections=extractDaySections(pages);
  const layout=rowLayout|| (columns?{days:columns,homework:[],layout:'five-columns'}:sections);
  const lists=layout?.days||verticalDayLists(pages);
  const days=Object.fromEntries(DAYS.map(d=>[d,parseDay(lists[d]||[])]));
  const homework=parseHomework(uniqueValues([...select('homework'),...(layout?.homework||[]),...extractHomeworkGrid(pages)]));
  const learningGoals=select('learningGoals');
  const notices=select('notices');
  const subjects=select('subjects');
  const weekTheme=select('weekTheme').join(' · ').slice(0,500)||null;
  const optionalMission=select('optionalMission').join(' ').slice(0,500)||null;
  const everyday=gearForPlan(days,segments);
  const dayCount=Object.values(days).filter(v=>v.events.length).length;
  const useful=dayCount||homework.length||learningGoals.length||notices.length||weekTheme||optionalMission||everyday.length;
  return {grade,week,year,source,pdf,days,homework,learningGoals,notices,subjects,weekTheme,optionalMission,everyday,
    parsedFromPdf:true,layout:layout?.layout||'unknown',status:!useful?'unreadable':!dayCount?'partial':'ok',
    warning:!useful?'Fant PDF, men kunne ikke hente ut lesbar ukeplan. Se originalen.':dayCount<5?'Utdraget kan være ufullstendig. Sjekk original-PDF.':'Automatisk utdrag. Sjekk original-PDF ved tvil.'};
}
