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
  if (/^(husk|huskeliste)$/.test(t))return 'notices';
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
      const inline=line.match(/^(Tema|Periode)\s*:\s*(.+)$/i);
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
      for(const item of gear)bring.push({label:item});
      continue;
    }
    if(/^[-–•]?$/.test(s))continue;
    const time=s.match(/\b(?:kl\.?\s*)?(\d{1,2}[.:]\d{2})(?:\s*[-–]\s*(\d{1,2}[.:]\d{2}))?/);
    events.push({title:s,time:time?time[0]:null});
  }
  return {events,bring:[...new Map(bring.map(x=>[x.label.toLocaleLowerCase('nb-NO'),x])).values()]};
}
export function analyzePdfPages(pages,grade,pdf,week,year,source){
  const segments=textSegments(pages);
  const select=(key)=>uniqueValues(segments.filter(x=>x.section===key).map(x=>x.text));
  let columns=null;
  for(const p of pages){const candidate=extractColumns(p);if(candidate){columns=candidate;break;}}
  const lists=columns||verticalDayLists(pages);
  const days=Object.fromEntries(DAYS.map(d=>[d,parseDay(lists[d]||[])]));
  const homework=select('homework').map(text=>({subject:(text.match(/^([^:]{2,30}):/)||[])[1]||null,text}));
  const learningGoals=select('learningGoals');
  const notices=select('notices');
  const subjects=select('subjects');
  const weekTheme=select('weekTheme').join(' · ').slice(0,500)||null;
  const optionalMission=select('optionalMission').join(' ').slice(0,500)||null;
  const everyday=select('bring').map(label=>({label:label.replace(/^[-•]\s*/,'')}));
  const dayCount=Object.values(days).filter(v=>v.events.length).length;
  const useful=dayCount||homework.length||learningGoals.length||notices.length||weekTheme||optionalMission;
  return {grade,week,year,source,pdf,days,homework,learningGoals,notices,subjects,weekTheme,optionalMission,everyday,
    parsedFromPdf:true,status:!useful?'unreadable':!dayCount?'partial':'ok',
    warning:!useful?'Fant PDF, men kunne ikke hente ut lesbar ukeplan. Se originalen.':dayCount<5?'Utdraget kan være ufullstendig. Sjekk original-PDF.':'Automatisk utdrag. Sjekk original-PDF ved tvil.'};
}
