/** Extract only what is supported by the official PDF. Unknown fields stay empty. */
import {DAYS} from './calendar.mjs';
export {DAYS};
const norm = value => String(value??'').replace(/[\u0000-\u001f\u00ad]/g,' ').replace(/\s+/g,' ').trim();
const limited=(value,size=420)=>norm(value).slice(0,size);
const SECTION_PATTERN=/^(?:(?:tema\s*[-–]\s*dette jobber vi med denne uka)|ukeplan|lekser?(?:\s+(?:denne\s+uken|uke\s*\d{1,2}))?|hjemmearbeid|lekseplan|lekser og oppgaver|ukas utfordringer|ukens utfordringer|beskjeder(?: fra skolen)?|informasjon(?: til foresatte|\s+uke\s*\d{1,2})?|læringsmål|læringsmal|fag(?:ene)? denne uka|fag denne uken|ukas tema|ukens tema|tema for uka|frivillig oppdrag|ukas oppdrag|ukens oppdrag|dette skjer(?: fremover)?|huskeliste|husk|viktig informasjon)\s*:?$/i;
const namedSection=(line)=>{
  const t=norm(line).replace(/[:\s]+$/,'').toLowerCase();
  if (/^(lekse|lekser|lekseplan|hjemmearbeid|ukas utfordringer|ukens utfordringer)/.test(t))return 'homework';
  if (/^(læringsmål|læringsmal)/.test(t))return 'learningGoals';
  if (/^(?:tema\s*[-–]\s*dette jobber vi med denne uka|fag(?:ene)? denne uka|fag denne uken)/.test(t))return 'subjects';
  if (/^(tema|ukas tema|ukens tema|tema for uka|periode)/.test(t))return 'weekTheme';
  if (/^(frivillig oppdrag|ukas oppdrag|ukens oppdrag)/.test(t))return 'optionalMission';
  if (/^(beskjeder|informasjon|dette skjer|viktig informasjon)/.test(t))return 'notices';
  if (/^(husk|huskeliste)$/.test(t))return 'packing';
  return null;
};
const htmlDecode=s=>s.replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&nbsp;/gi,' ').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
/** Accept only PDFs for the selected week, never a previous week's PDF. */
export function findPdfLinks(html,sectionUrl,allowedHosts=['www.minskole.no','minskole.no','www.minskule.no','minskule.no']) {
  const links=[];
  const rx=/<a\b([^>]*\bhref\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*)>([\s\S]*?)<\/a>/gi;
  for(const a of String(html).matchAll(rx)){
    const m=a[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if(!m)continue;
    let url;
    try{url=new URL(htmlDecode(m[1]||m[2]||m[3]),sectionUrl);}catch{continue;}
    if(url.protocol!=='https:'||url.username||url.password||!allowedHosts.includes(url.hostname)||!/\.pdf$/i.test(url.pathname))continue;
    const label=norm(htmlDecode(a[2].replace(/<[^>]*>/g,' ')));
    const name=label+' '+decodeURIComponent(url.pathname);
    // "Ukeplan 6. trinn uke 44" describes 6th grade, not week 6.
    // Prefer the last explicit week token when both grade and week are present.
    const matches=[...name.matchAll(/\buke(?:plan|brev)?[\s.\-_]*(\d{1,2})(?!\d)/gi)];
    if(!matches.length)continue;
    const week=Number(matches.at(-1)[1]);if(week<1||week>53)continue;
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
// A PDF section may be followed by another heading or a day table. Never let
// a generic heading (notably "Læringsmål") consume the rest of a PDF page.
const DUE_DAY=/^til\s+(?:mandag|tirsdag|onsdag|torsdag|fredag)\s*:?$/i;
const DAY_ONLY=/^(?:mandag|tirsdag|onsdag|torsdag|fredag)(?:\s+på skolen)?\s*:?$/i;
const DAY_INLINE=/^(mandag|tirsdag|onsdag|torsdag|fredag)\s*(?::|[–-]|på skolen\s*[:–-]|\s+(?:kl\.|skal|har|blir|er|går|møter|starter|slutter)\b)\s*(.+)$/i;
const HOMEWORK_INLINE=/^(?:lekse(?:r)?\s*)?til\s+(tirsdag|onsdag|torsdag|fredag|mandag)\s*:\s*(.*)$/i;
const ACTION_TEXT=/\b(?:ta med|husk(?: å ta med)?|pakk|i sekken|leveres|gjør oppgave|les side|les s\.|øv på)\b/i;
const ACTIVITY_TEXT=/\b(?:gym|svømm|uteskole|turdag|bibliotek|utflukt|eksursjon|kl\.|starter|slutter)\b/i;
function textSegments(pages){
  const out=[];let current=null,day=null,dueDay=null;
  for(const page of pages){
    // Section headings are laid out in document order, but sometimes the day
    // grid interrupts them. Stop immediately at grid boundaries.
    for(const row of linesFromPage(page)){
      const line=norm(row.text);
      if(!line)continue;
      if ((/\bmandag\b/i.test(line)&&/\btirsdag\b/i.test(line)&&/\bfredag\b/i.test(line)) ||
          /^oversikt\s*\/\s*huskeliste/i.test(line) || /^ukeplan for\b/i.test(line) || /^dag\s+p[åa]\s+skolen\s+i\s+lekse/i.test(line)){
        current=null;day=null;dueDay=null;continue;
      }
      if(!current&&/^(?:sosialt|norsk|matte|matematikk|engelsk|naturfag|samfunnsfag|krle)\s*:\s*(?:jeg|vi|eleven)\b/i.test(line)){
        out.push({section:'learningGoals',text:limited(line)});continue;
      }
      const inline=line.match(/^(Tema|Periode|Fag(?:ene)? denne uka|Fag denne uken)\s*[:=]\s*(.+)$/i);
      if(inline){out.push({section:/^fag/i.test(inline[1])?'subjects':'weekTheme',text:limited(inline[2],350)});current=null;day=null;dueDay=null;continue;}
      const due=line.match(HOMEWORK_INLINE);
      if(due){
        // A bare "Til torsdag:" heading is not itself a homework assignment.
        current='homework';day=null;dueDay=due[1];
        if(due[2])out.push({section:'homework',text:limited(`Til ${due[1]}: ${due[2]}`,450)});
        continue;
      }
      const dayInline=line.match(DAY_INLINE);
      if(dayInline){out.push({section:'daily',day:DAY_LABEL(dayInline[1]),text:limited(dayInline[2])});current='daily';day=DAY_LABEL(dayInline[1]);dueDay=null;continue;}
      if(DAY_ONLY.test(line)){
        // A day heading in a section is a daily activity, not a new goal/notice.
        current='daily';day=DAY_LABEL(line);dueDay=null;continue;
      }
      if(SECTION_PATTERN.test(line)){
        const next=namedSection(line);
        current=next;day=null;dueDay=null;
        continue;
      }
      if(DUE_DAY.test(line)) {current='homework';day=null;dueDay=line.replace(/^til\s+|:$/gi,'');continue;}
      if(current&&line.length>1){
        const value=current==='homework'&&dueDay?`Til ${dueDay}: ${line}`:line;
        out.push({section:current,day:current==='daily'?day:null,text:limited(value,450)});
      }
    }
  }
  return out;
}
function DAY_LABEL(value){return DAYS.find(d=>new RegExp('^'+d,'i').test(norm(value)))||null;}
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
/** Recover day rows when a PDF text layer splits the three column headers.
 * Never invent assignments: each event and due date comes from a source token.
 */
export function extractDayRowsFallback(pages){
  for(const page of pages){
    const rows=page.items||[];
    const markers=rows.map(t=>({...t,dayIndex:isDayToken(t.text)}))
      .filter(t=>t.dayIndex>=0&&t.x<page.width*.3)
      .sort((a,b)=>a.y-b.y);
    const found=new Map();for(const m of markers)if(!found.has(m.dayIndex))found.set(m.dayIndex,m);
    if(found.size<4)continue;
    const sorted=[...found.values()].sort((a,b)=>a.y-b.y);
    const days=Object.fromEntries(DAYS.map(d=>[d,[]]));
    const homework=[];
    // Header sometimes appears as "Dag På skolen I lekse" in one PDF span.
    const header=rows.some(t=>/dag\s+p[åa]\s+skolen\s+i\s+lekse/i.test(t.text)||/^(?:p[åa]\s+skolen|i\s+lekse)\b/i.test(t.text));
    if(!header)continue;
    const hwHeader=rows.find(t=>/^(?:i\s+lekse|lekser?)\b/i.test(t.text)&&t.y<sorted[0].y);
    const split=hwHeader?.x>page.width*.48?hwHeader.x-9:page.width*.67;
    sorted.forEach((m,i)=>{
      const top=m.y-3,bottom=i+1<sorted.length?sorted[i+1].y-3:page.height-4;
      days[DAYS[m.dayIndex]]=rectLines(page,m.x+30,split,top,bottom)
        .filter(s=>!DAYS.some(d=>new RegExp('^'+d+'\\b','i').test(s)));
      homework.push(...rectLines(page,split,page.width-3,top,bottom));
    });
    return {days,homework,layout:'day-rows-fallback'};
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
    const headings=tokens.filter(t=>/^(?:ukas utfordringer|ukens utfordringer|lekser(?: og oppgaver| til)?|lekseplan|hjemmearbeid)\s*:?$/i.test(norm(t.text)));
    const dayTokens=tokens.filter(t=>/^(?:til\s+)?(?:tirsdag|onsdag|torsdag|fredag|mandag)\s*:?$/i.test(norm(t.text)));
    const tableStarts=[...new Set([...headings.map(h=>h.y),...dayTokens.map(h=>h.y)])].sort((a,b)=>a-b);
    for(const topY of tableStarts){
      const nearby=dayTokens.filter(t=>Math.abs(t.y-topY)<44).sort((a,b)=>a.x-b.x);
      // Plain weekday labels can be the regular timetable, not homework.
      const hasHomeworkTitle=headings.some(h=>Math.abs(h.y-topY)<44);
      const hasDueHeader=nearby.some(h=>/^til\s+/i.test(norm(h.text)));
      if(!hasHomeworkTitle&&!hasDueHeader)continue;
      if(nearby.length<2 && !(nearby.length===1&&hasHomeworkTitle))continue;
      const seen=new Set();
      const dayHeaders=nearby.filter(t=>{const key=norm(t.text).replace(/^til\s+/i,'').replace(/:$/,'').toLowerCase();if(seen.has(key))return false;seen.add(key);return true;});
      if(!dayHeaders.length)continue;
      const start=Math.max(...dayHeaders.map(x=>x.y))+8;
      const bottom=Math.min(page.height-4,...tokens.filter(t=>t.y>start+10 &&
        /^(?:læringsmål|mål:|beskjeder|informasjon|hilsen|ukens mål|fag denne uka)\b/i.test(norm(t.text)))
        .map(t=>t.y-3));
      if(bottom<=start+10)continue;
      const minLeft=dayHeaders[0].x;
      for(let i=0;i<dayHeaders.length;i++){
        const header=dayHeaders[i];
        const day=norm(header.text).replace(/^til\s+/i,'').replace(/:$/,'');
        const right=i+1<dayHeaders.length?dayHeaders[i+1].x-8:page.width-3;
        // Read only the cell, never its bare "Til torsdag" heading.
        const cell=rectLines(page,header.x-8,right,start,bottom);
        for(const assignment of cell){
          if(assignment.length>2&&!/^(?:til\s+)?(?:tirsdag|onsdag|torsdag|fredag|mandag)\s*:?$/i.test(assignment))homework.push(`Til ${day.toLowerCase()}: ${assignment}`);
        }
      }
      // Subject column is not a homework task on its own: the cell has the task.
    }
  }
  return uniqueValues(homework);
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
  // Do not mistake a blank due-date column header for a homework assignment.
  const tasks=[];
  for(const line of lines){
    const t=limited(line,500);
    if(!t||/^(?:dag|på skolen|i lekse|leks[ea]r?|hjemmearbeid|til\s+(?:mandag|tirsdag|onsdag|torsdag|fredag)\s*:?)$/i.test(t))continue;
    const m=t.match(/^((?:norsk|engelsk|matematikk|matte|naturfag|krle|samfunnsfag|lesing(?:\/engelsk)?|ukelekse|til\s+(?:mandag|tirsdag|onsdag|torsdag|fredag)))\s*:\s*(.*)$/i);
    if(m){
      if(m[2].trim())tasks.push({subject:m[1],text:t});
      // For "Norsk:" on one line, the following line is part of that subject.
      else tasks.push({subject:m[1],text:'',pending:true});
      continue;
    }
    const previous=tasks.at(-1);
    if(previous&&(previous.pending||(!/^[•*\-]/.test(t)&&previous.text.length<420))){
      previous.text=limited([previous.text,t].filter(Boolean).join(' '),500);
      previous.pending=false;
    }else tasks.push({subject:null,text:t});
  }
  return [...new Map(tasks.filter(x=>x.text&&x.text.length>2).map(({subject,text})=>[text.toLocaleLowerCase('nb-NO'),{subject,text}])).values()];
}
// Reclassify content where a PDF or extractor placed several logical blocks
// beneath a single heading. Goals should be actual learning goals; schedules,
// homework, packing instructions and parent information have dedicated places.
function classifySegments(segments){
  const result={homework:[],learningGoals:[],notices:[],subjects:[],weekTheme:[],optionalMission:[],packing:[],daily:[]};
  for(const entry of segments){
    const s=norm(entry.text),kind=entry.section;
    if(!s)continue;
    const due=s.match(HOMEWORK_INLINE);
    const daily=s.match(DAY_INLINE);
    if(kind==='daily'&&entry.day){result.daily.push({day:entry.day,text:s});continue;}
    if(daily){result.daily.push({day:DAY_LABEL(daily[1]),text:daily[2]});continue;}
    if(due){if(due[2].trim())result.homework.push(`Til ${due[1]}: ${due[2]}`);continue;}
    if(DUE_DAY.test(s)||DAY_ONLY.test(s))continue;
    if(/^(?:fag(?:ene)? denne uka|fag denne uken)\s*:?$/i.test(s))continue;
    if(/^(?:fag(?:ene)? denne uka|fag denne uken)\s*:/i.test(s)){
      result.subjects.push(s.replace(/^[^:]+:/,''));continue;
    }
    if(kind==='learningGoals'){
      if(ACTION_TEXT.test(s)) {
        if(/\b(?:ta med|husk|pakk|i sekken)\b/i.test(s))result.packing.push(s);
        else result.homework.push(s);
        continue;
      }
      if(/\b(?:foresatte|foreldre|husk at|viktig informasjon|informasjon til|meld fra|gi beskjed)\b/i.test(s)){
        result.notices.push(s);continue;
      }
      if(ACTIVITY_TEXT.test(s)&&!/\b(?:jeg kan|jeg skal kunne|vi skal lære|elevene skal kunne)\b/i.test(s)){
        result.notices.push(s);continue;
      }
      if(!/\b(?:jeg kan|jeg vet|jeg skal|vi kan|vi lærer|elevene skal|mål(?:et)? er|å kunne|skal kunne|kunne)\b/i.test(s)){
        if(/^(?:norsk|matte|matematikk|engelsk|krle|naturfag|samfunnsfag)\s*:/i.test(s))result.subjects.push(s);
        else result.notices.push(s);
        continue;
      }
    }
    if(kind==='notices'){
      if(/^(?:til\s+\w+|les\s+\d|gjør\s+oppgave|øv\s+på)\b/i.test(s)) {result.homework.push(s);continue;}
    }
    if(kind==='weekTheme' && /^fag\b/i.test(s)){result.subjects.push(s);continue;}
    if(result[kind])result[kind].push(s);
  }
  for(const key of ['homework','learningGoals','notices','subjects','weekTheme','packing','optionalMission'])result[key]=uniqueValues(result[key]);
  return result;
}
export function analyzePdfPages(pages,grade,pdf,week,year,source){
  const segments=textSegments(pages);
  const sections=classifySegments(segments);
  const select=(key)=>sections[key]||[];
  let columns=null;
  for(const p of pages){const candidate=extractColumns(p);if(candidate){columns=candidate;break;}}
  const rowLayout=extractDayRows(pages);
  const daySections=extractDaySections(pages);
  const layout=rowLayout|| (columns?{days:columns,homework:[],layout:'five-columns'}:daySections)||extractDayRowsFallback(pages);
  const lists=layout?.days||verticalDayLists(pages);
  const days=Object.fromEntries(DAYS.map(d=>[d,parseDay(lists[d]||[])]));
  const homework=parseHomework(uniqueValues([...select('homework'),...(layout?.homework||[]),...extractHomeworkGrid(pages)]));
  const learningGoals=select('learningGoals');
  const notices=select('notices');
  const subjects=select('subjects');
  const weekTheme=select('weekTheme').join(' · ').slice(0,500)||null;
  const optionalMission=select('optionalMission').join(' ').slice(0,500)||null;
  for(const note of sections.daily){
    if(!note.day||!note.text)continue;
    if(!days[note.day].events.some(e=>e.title===note.text))days[note.day].events.push({title:note.text,time:null});
  }
  const globalPack=[];
  for(const text of sections.packing){
    // Packing remarks attached to a named day belong on that day's checklist.
    const mentioned=DAYS.filter(d=>new RegExp('\\b'+d+'\\b','i').test(text));
    if(mentioned.length===1){days[mentioned[0]].bring.push(...gearFromStatement(text));}
    else globalPack.push({section:'packing',text});
  }
  const everyday=gearForPlan(days,[...segments.filter(s=>s.section!=='packing'),...globalPack]);
  for(const note of sections.daily){
    if(!note.day)continue;
    for(const gear of gearFromStatement(note.text)){
      if(!days[note.day].bring.some(x=>x.label.toLowerCase()===gear.label.toLowerCase()))days[note.day].bring.push(gear);
    }
  }
  const dayCount=Object.values(days).filter(v=>v.events.length).length;
  const useful=dayCount||homework.length||learningGoals.length||notices.length||weekTheme||optionalMission||everyday.length||subjects.length;
  return {grade,week,year,source,pdf,days,homework,learningGoals,notices,subjects,weekTheme,optionalMission,everyday,
    parsedFromPdf:true,layout:layout?.layout||'unknown',status:!useful?'unreadable':dayCount<3?'partial':'ok',
    warning:!useful?'Fant PDF, men kunne ikke hente ut lesbar ukeplan. Se originalen.':dayCount<5?'Utdraget kan være ufullstendig. Sjekk original-PDF.':'Automatisk utdrag. Sjekk original-PDF ved tvil.'};
}
