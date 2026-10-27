// Public school week-plan interpretation. Only report content that can be traced to a PDF.
export const DAYS = ['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
import {SITE} from '../public/site-config.mjs';
export const CLASS_URLS = Object.freeze({...SITE.grades});
const neat = (s) => String(s || '').replace(/[\u0000-\u001f\u00ad]/g,' ').replace(/\s+/g,' ').trim();
const limit = (s, n=280) => neat(s).slice(0,n);

export function osloCalendar(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone:'Europe/Oslo',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
  const t = new Date(Date.UTC(parts.year,parts.month-1,parts.day));
  const mondayOffset=(t.getUTCDay()+6)%7;
  const thursday=new Date(t);thursday.setUTCDate(t.getUTCDate()-mondayOffset+3);
  const isoYear=thursday.getUTCFullYear();
  const yearJan4=new Date(Date.UTC(isoYear,0,4));
  const week1Mon=new Date(yearJan4);week1Mon.setUTCDate(yearJan4.getUTCDate()-(yearJan4.getUTCDay()+6)%7);
  const week=Math.round((t.getTime()-mondayOffset*86400000-week1Mon.getTime())/604800000)+1;
  return {year:isoYear,week,day:parts.day,month:parts.month};
}

export function findPdfLinks(html, pageUrl) {
  // Input is the decoded trinn-page HTML, parsed by the function with cheerio.
  // This lightweight fallback is also used for isolated tests.
  const links=[];
  const rx=/<a\b([^>]*\bhref\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*)>([\s\S]*?)<\/a>/gi;
  for(const m of html.matchAll(rx)) {
    const u=m[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if(!u)continue;
    const raw=(u[1]||u[2]||u[3]||'').replace(/&amp;/g,'&');
    let url;
    try{url=new URL(raw,pageUrl)}catch{continue}
    if(!SITE.pdfHosts.includes(url.hostname))continue;
    const label=neat(m[2].replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' '));
    const weekMatch=(label+' '+url.pathname).match(/(?:ukeplan|uke)\s*[-_.:]?\s*(\d{1,2})(?=\D|$)/i);
    if(!weekMatch || !(url.pathname.toLowerCase().includes('.pdf')||/\.pdf\b/i.test(label)))continue;
    const week=Number(weekMatch[1]);if(week<1||week>53)continue;
    links.push({label,url:url.toString(),week});
  }
  return [...new Map(links.map(x=>[x.url,x])).values()];
}
export function choosePdf(links,week) {
  // Never label an older week plan as current. Preserve school's displayed order.
  return links.find(x=>x.week===week)||null;
}

function orderedLines(items,{x0=-Infinity,x1=Infinity,y0=-Infinity,y1=Infinity}={}) {
  const selected=items.filter(i=>i.x>=x0&&i.x<x1&&i.y>=y0&&i.y<y1&&neat(i.text));
  // Same visual row ~= same text baseline; avoid merging other columns.
  selected.sort((a,b)=>Math.abs(a.y-b.y)<3 ? a.x-b.x : a.y-b.y);
  const lines=[];
  for(const token of selected){
    const last=lines.at(-1);
    if(last && Math.abs(last.y-token.y)<3.5 && token.x>=last.lastX-4){
      last.text += (/[\s-]$/.test(last.text)||/^[.,:;!?)]/.test(token.text)?'':' ') + token.text;
      last.lastX=Math.max(last.lastX,token.x+token.width);
    } else {
      lines.push({y:token.y,lastX:token.x+token.width,text:token.text});
    }
  }
  return lines.map(l=>neat(l.text)).filter(Boolean);
}

function detectDayTable(page){
 const markers=[];
 for(const tok of page.items){
   for(let i=0;i<DAYS.length;i++){
     if(new RegExp('^'+DAYS[i]+'(?:\\b|\\s|\\d)','i').test(tok.text)){
       markers.push({day:i,x:tok.x,y:tok.y});break;
     }
   }
 }
 for(const monday of markers.filter(m=>m.day===0).sort((a,b)=>a.y-b.y)){
   const row=[monday];
   for(let d=1;d<5;d++){
     const next=markers.filter(m=>m.day===d&&Math.abs(m.y-monday.y)<18&&m.x>row.at(-1).x+12).sort((a,b)=>Math.abs(a.y-monday.y)-Math.abs(b.y-monday.y))[0];
     if(!next)break;row.push(next);
   }
   if(row.length!==5)continue;
   const starts=row.map(r=>r.x);
   const top=Math.max(...row.map(r=>r.y))+10;
   const sectionMarks=page.items.filter(t=>t.y>top+25&&/^(?:lekser|informasjon|dette skjer|plan for|fremover|hilsen|læringsmål|periode)\b/i.test(neat(t.text)));
   // Table ends when a new heading starts below it; choose the earliest full-width heading.
   const bottom=Math.min(page.height-5,...sectionMarks.map(t=>t.y-5));
   if(bottom<=top+10)continue;
   return {starts,top,bottom};
 }
 return null;
}
function extractDayColumns(pages){
  const data=Object.fromEntries(DAYS.map(d=>[d,[]]));
  for(const page of pages){
    const table=detectDayTable(page);if(!table)continue;
    for(let i=0;i<5;i++){
      const left=table.starts[i]-9;
      const right=i<4?table.starts[i+1]-9:page.width-10;
      const lines=orderedLines(page.items,{x0:left,x1:right,y0:table.top,y1:table.bottom}).map(tidyDailyLine).filter(Boolean);
      // Keep the largest meaningful table for each day; avoid smaller recap tables.
      if(lines.length>data[DAYS[i]].length)data[DAYS[i]]=lines;
    }
  }
  return data;
}
// Some PDFs include link annotations, image labels and the following schedule table
// in their text layer. None of these are daily notices.
const PDF_NOISE=/\b(?:les mer her|svg|plan for svømming|dette skjer fremover|oversikt\s*\/\s*huskeliste|hilsen oss på|tlf til arbeidsrom)\b|\bUke\s+Dag\s+Dato\b/i;
const GROUP_TABLE_NOISE=/\b(?:oransje|blå|grønn|gul|rød|rosa)\b[\s,]+(?:oransje|blå|grønn|gul|rød|rosa)\b/i;
function tidyDailyLine(raw){
 const line=neat(raw).replace(/[\uFFFC\uFFFD]/g,'');
 if(PDF_NOISE.test(line)||/^(?:\d{1,2}\s*[-–]\s*\d{1,2}\s+svømming|(?:Uke\s*)?\d{1,2}\s+(?:Mandag|Tirsdag))\b/i.test(line))return '';
 if(GROUP_TABLE_NOISE.test(line)&&!/\b(?:møter|buss|svømmer|svømming)\b/i.test(line))return '';
 if(/^(?:\d{1,2}\s*[.:]\s*\d\d\s*[-–]\s*\d{1,2}\s*[.:]\s*\d\d\s*){2,}$/i.test(line))return '';
 return line;
}
function matchAny(s, regex){return regex.test(s.toLowerCase())}
const GEAR_RULES = [
  [/badetøy|badedrakt|badebukse/i,'Badetøy','Til svømming'],
  [/håndkle/i,'Håndkle','Til svømming eller dusj'],
  [/hårstrikk/i,'Hårstrikk','Ved langt hår'],
  [/gymtøy|gymklær/i,'Gymtøy','Til gym'],
  [/gymsko|innesko/i,'Innesko / gymsko','Til aktivitet på skolen'],
  [/grillmat/i,'Grillmat','Til tur'],
  [/vedkubbe/i,'Én vedkubbe','Til bål på tur'],
  [/(?:varme|passende)\s+(?:nok\s+)?klær|turtøy/i,'Varme klær / turtøy','Kle deg etter været'],
  [/kostyme|kle seg ut/i,'Kostyme','Se skolens regler for utkledning'],
  [/matpakke/i,'Matpakke','Ta med på skolen'],
  [/drikkeflaske/i,'Drikkeflaske','Ta med på skolen'],
  [/refleks/i,'Refleks','På skoleveien'],
  [/postmappe/i,'Postmappe','Skal ligge i sekken'],
];
function gearFrom(text,allowed=null){
 return GEAR_RULES.filter(([rx,lab])=>(!allowed||allowed.includes(lab))&&rx.test(text)).map(([rx,label,note])=>({label,note}));
}
function uniqueByLabel(items){return [...new Map(items.map(x=>[x.label,x])).values()];}
function eventIcon(s){if(/svømm|badetøy/i.test(s))return 'waves';if(/gym|idrett|ball/i.test(s))return 'activity';if(/tur|skog|grønn slette|uteskole/i.test(s))return 'trees';if(/sløyd|tekstil|kunst/i.test(s))return 'scissors';if(/musikk|sang/i.test(s))return 'music';if(/halloween|forestilling|kultur/i.test(s))return 'sparkles';return 'book';}
function buildDaily(columnLines, notices){
  const days={};
  for(const [name,idx] of DAYS.map((d,i)=>[d,i])){
    const lines=columnLines[name]||[];
    let start=null,end=null;
    const content=[];
    for(const l of lines){
      let hm=l.match(/(?:kl\.?\s*)?(\d{1,2})[.:](\d\d)\s*[-–]\s*(\d{1,2})[.:](\d\d)/);
      if(hm&&(!start||!end)){start=`${hm[1].padStart(2,'0')}:${hm[2]}`;end=`${hm[3].padStart(2,'0')}:${hm[4]}`;continue}
      hm=l.match(/^slutt\s*:?[\s]*(\d{1,2})[.:](\d\d)/i);
      if(hm){end=`${hm[1].padStart(2,'0')}:${hm[2]}`;continue}
      if(/^\d{1,2}[.:]\d\d\s*[-–]\s*\d{1,2}[.:]\d\d$/.test(l))continue;
      content.push(l);
    }
    // PDF text fragments may break sentences; preserving each line is more accurate than invented summaries.
    const description=limit(content.join(' '),1200);
    const events=[];
    if(description){
      const chunks=[];
      for(const line of content){
        const x=neat(line);
        if(!x)continue;
        if(chunks.length && (x.length<31 || /^[a-zæøå]/.test(x))) chunks[chunks.length-1]+=' '+x;
        else chunks.push(x);
      }
      const parts=chunks.length?chunks:[description];
      for(const p of parts.slice(0,7)){
        const ev=limit(p,460);
        if(/^(slutt|\d{1,2}\.\d\d\s*[-–]\s*\d{1,2}\.\d\d)/i.test(ev))continue;
        events.push({time:'Fra ukeplanen',title:limit(ev,135),detail:ev.length>135?ev:'',icon:eventIcon(ev),tone:'aqua'});
      }
    }
    const extra=notices.filter(n=>{
      const t=n.detail.toLowerCase();
      const names=['mandag','tirsdag','onsdag','torsdag','fredag'];
      return names.some(nm=>t.includes(nm)) && new RegExp(name.toLowerCase(),'i').test(t);
    });
    const relevantText=[description,...extra.map(x=>x.detail)].join(' ');
    let bring=gearFrom(relevantText);
    // Global "Husk å ta med badetøy" for a day mentioning swimming.
    if(/svømm/i.test(description)){
      const swimmingNotes=notices.filter(n=>/svømm|badetøy|håndkle/i.test(n.detail)).map(n=>n.detail).join(' ');
      bring=uniqueByLabel([...bring,...gearFrom(swimmingNotes,['Badetøy','Håndkle','Hårstrikk'])]);
    }
    const subtitle=events.length?limit(events[0].title,90):'Ingen spesielle dagsaktiviteter oppgitt';
    days[name]={start,end,subtitle,events,bring,alert:bring.length?`${bring.map(v=>v.label).join(' · ')}`:null};
  }
  return days;
}

// Classify homework by headings, not by a previous subject's continuation.
// In Fagerholt's 3rd-grade PDF the heading is e.g. "Engelsklekse til neste
// engelsktime:" rather than simply "Engelsk:".
export function extractHomework(pages){
 const found=[];
 const head=/(?:^|\s)(Norsk(?:\s*\([^)]*\))?|Engelsk(?:lekse(?:\s+til\s+neste\s+engelsktime)?)?|Matte|Matematikk|KRLE|Naturfag|Samfunnsfag|Lesing|Ukelekse)\s*:/gi;
 const subjectOf=(label)=>/^engelsk/i.test(label)?'Engelsk':/^norsk/i.test(label)?'Norsk':/^matematikk|^matte/i.test(label)?'Matte':label;
 for(const page of pages){
  const lines=orderedLines(page.items);
  let section=[];let collecting=false;
  for(const line of lines){
   if(/^lekser(?:\s+uke\s*\d+)?\s*:?$/i.test(line)){collecting=true;continue}
   if(!collecting)continue;
   if(/^(?:tlf\s+til|periode|informasjon|dette skjer|læringsmål|hilsen|oversikt|plan for|huskeliste|ukens mål|tema)\b/i.test(line))break;
   // Protect against layout noise from links and later schedule tables.
   if(PDF_NOISE.test(line)||/\bsvg\b/i.test(line))continue;
   section.push(line);
  }
  if(!section.length)continue;
  const text=neat(section.join(' '));
  const labels=[...text.matchAll(head)];
  for(let i=0;i<labels.length;i++){
   const m=labels[i], next=labels[i+1]?.index??text.length;
   const detail=limit(text.slice(m.index+m[0].length,next).replace(/^\s*[:–-]\s*/,''),550);
   if(detail.length>5)found.push({subject:subjectOf(m[1].trim()),detail});
  }
 }
 const unique=[...new Map(found.map(v=>[`${v.subject}:${v.detail}`,v])).values()];
 return unique.slice(0,12).map((x,i)=>({...x,tone:x.subject==='Engelsk'?'lavender':x.subject==='Norsk'?'peach':['aqua','lavender','peach'][i%3]}));
}

/** Extract only learning goals explicitly labelled in the selected grade's PDF.
 * A missing/ambiguous learning-goal heading results in [], never inferred goals.
 * PDF text can wrap across several lines, so we keep continuations together.
 */
export function extractLearningGoals(pages){
 const heading=/^(?:(?:ukas|ukens)\s+)?læringsmål(?:\s+(?:denne\s+uka|denne\s+uken|for\s+(?:uka|uken|uke\s*\d+)))?\s*(?:[:–—-]\s*(.*))?$/i;
 const altHeading=/^(?:(?:ukas|ukens)\s+mål|dette\s+skal\s+vi\s+lære)\s*(?:[:–—-]\s*(.*))?$/i;
 const sectionEnd=/^(?:(?:ukeplan|lekser|uke\s*\d+|informasjon|info\s+til\s+hjemmet|beskjeder|huskeliste|hilsen|tlf\b|dette\s+skjer|oversikt|plan\s+for|periode|tema|ukas\s+tema|ukens\s+tema|ukens\s+fokus|ukas\s+fokus|sosialt?\s+mål|sosiale?\s+mål|svømming\s+for|mandag|tirsdag|onsdag|torsdag|fredag)\b|\d{1,2}[.:]\d{2}\s*[-–])/i;
 const subject=/^(?:norsk|engelsk|matte|matematikk|naturfag|samfunnsfag|krle|kroppsøving|musikk|kunst\s+og\s+håndverk|lesing|skriving)\s*[:–—-]\s*/i;
 const newGoal=/^(?:[•●▪►*]\s*|\d{1,2}[.)]\s+|(?:jeg|vi|elevene|du)\s+(?:kan|skal|lærer|øver|vet|kjenner|forstår)\b)/i;
 const invalid=line => !line || /\b(?:svg|les\s+mer\s+her|https?:\/\/|www\.|fagerholt\.no)\b/i.test(line) ||
   /\b(?:Uke\s+Dag\s+Dato|Plan\s+for\s+svømming)\b/i.test(line) ||
   /\b\d{1,2}[.:]\d{2}\s*[-–]\s*\d{1,2}[.:]\d{2}\b/.test(line);
 const goals=[];
 for(const page of pages){
  const rows=orderedLines(page.items||[]);
  let capturing=false;
  let current='';
  const save=()=>{
   const val=limit(current.replace(/^[\s•●▪►*]+/,'').trim(),420);
   if(val.length>=5&&!invalid(val)&&!sectionEnd.test(val))goals.push(val);
   current='';
  };
  for(const line of rows){
   const row=neat(line);
   const headingMatch=row.match(heading)||row.match(altHeading);
   if(headingMatch){
    if(capturing)save();
    capturing=true;
    const inline=neat(headingMatch[1]||'');
    if(inline&&!invalid(inline))current=inline;
    continue;
   }
   if(!capturing)continue;
   if(sectionEnd.test(row)) {save();capturing=false;continue;}
   if(invalid(row))continue;
   const cleaned=row.replace(/^[•●▪►*]\s*/, '').trim();
   if(cleaned.length<3)continue;
   if(subject.test(row)||newGoal.test(row)) {
    save();
    current=cleaned;
   } else if(!current) {
    current=cleaned;
   } else if(current.length+1+cleaned.length<=420) {
    current+=' '+cleaned;
   } else {
    save();current=cleaned;
   }
  }
  if(capturing)save();
 }
 return [...new Map(goals.map(g=>[g.toLocaleLowerCase('nb-NO'),g])).values()].slice(0,16);
}

function extractNotices(pages){
 let raw=[];
 for(const page of pages){
   const lines=orderedLines(page.items);
   const st=lines.findIndex(x=>/^(?:informasjon(?:\s+uke\s*\d+)?|info til hjemmet|beskjeder)\s*:?$/i.test(x));
   if(st<0)continue;
   const selected=lines.slice(st+1);
   for(const l of selected){if(/^(lekser|læringsmål|(?:ukas|ukens)\s+mål|huskeliste|hilsen|tlf til|oversikt\/huskeliste)\b/i.test(l))break;raw.push(l)}
 }
 // Create useful notices without pretending to understand the entire teacher message.
 const clean=raw.join(' ').replace(/\s+/g,' ');
 const sections=clean.split(/(?=\b(?:Svømming|Refleks|Egenberedskapsuka|Halloweenkostymedagen|Planleggingsdager|Dette skjer fremover|Mandag \d|Husk refleks|Siste skoledag)\s*:?)/i);
 const notices=[];
 for(let part of sections){part=neat(part);if(part.length<18||PDF_NOISE.test(part)||/\bsvg\b/i.test(part))continue;notices.push({title:limit(part.split(':')[0].split('.')[0],68),detail:limit(part,370),icon:eventIcon(part),tone:'peach'})}
 // Long unstructured block: show beginning as excerpt, with source document linked.
 if(!notices.length&&clean.length>25)notices.push({title:'Informasjon fra skolen',detail:limit(clean,390),icon:'book',tone:'sky'});
 return notices.slice(0,10);
}
function extractEveryday(pages){
 const lines=pages.flatMap(p=>orderedLines(p.items));
 const bag=lines.filter(s=>/(?:postmappe)/i.test(s)).join(' ');
 return uniqueByLabel(gearFrom(bag,['Postmappe']));
}
/** Extract a theme only when the PDF explicitly labels it as the week's focus.
 * Never infer a theme from individual lessons, events or homework. */
export function extractTheme(pages, grade = null){
 const rows=pages.flatMap(page=>orderedLines(page.items||[]));
 // A generic school period is not necessarily the week's actual theme.
 // Prefer an explicitly named "Ukas tema" or "Tema" over "Periode".
 const labels=[
  {kind:'theme',priority:4,rx:/^(?:(?:ukas|ukens)\s+)?tema\s*[:–—-]\s*(.*)$/i},
  {kind:'theme',priority:4,rx:/^(?:ukas|ukens)\s+tema\s*$/i},
  {kind:'theme',priority:3,rx:/^(?:(?:ukas|ukens)\s+)?fokus(?:omr[aå]de)?\s*[:–—-]\s*(.*)$/i},
  {kind:'theme',priority:3,rx:/^(?:ukas|ukens)\s+fokus\s*$/i},
  {kind:'period',priority:1,rx:/^(?:periode|periodens tema)\s*[:–—-]\s*(.*)$/i},
  {kind:'goal',priority:0,rx:/^(?:sosialt?|sosiale?)\s+(?:mål|fokus)\s*[:–—-]\s*(.*)$/i},
 ];
 const candidates=[];
 for(let i=0;i<rows.length;i++){
  const row=neat(rows[i]).replace(/[\u2022\u00b7]\s*$/,'');
  let match=null,kind=null,priority=0;
  for(const label of labels){const m=row.match(label.rx);if(m){match=m;kind=label.kind;priority=label.priority;break}}
  if(!match)continue;
  let value=neat(match[1]||'');
  if(!value){
   const next=neat(rows[i+1]||'');
   if(next.length>=3&&next.length<=90&&!/^(?:mandag|tirsdag|onsdag|torsdag|fredag|lekser|informasjon|ukeplan|tlf|slutt|norsk|engelsk|matte|tema|periode|sosialt\s+mål)\b/i.test(next) && !/https?:|\d{1,2}[.:]\d{2}/i.test(next))value=next;
  }
  value=limit(value.replace(/\s+\b(?:Ukeplan|Lekser|Mandag|Tirsdag|Onsdag|Torsdag|Fredag)\b.*$/i,''),98);
  if(!value || value.length<3 || /^(?:uke\s*\d+|ingen|ikke oppgitt|\d+|svg)$/i.test(value))continue;
  if(/(?:https?:|les mer her|fagerholt|\b(?:pdf|svg)\b)/i.test(value))continue;
  if(/(?:\d{1,2}[.:]\d{2}|\b\d{4}\b)/.test(value))continue;
  candidates.push({kind,value,priority,index:i});
 }
 // 7th-grade week plans can mention school-wide periods that are unrelated
 // to its weekly learning focus. Never present those as an explicit theme.
 const explicit=candidates.filter(x=>x.kind==='theme').sort((a,b)=>b.priority-a.priority || a.index-b.index)[0];
 const main=explicit || (String(grade)==='7' ? null : candidates.find(x=>x.kind==='period'));
 if(!main)return '';
 // Add a nearby labelled social goal only, never a stray goal from another section.
 const second=candidates.find(x=>x.kind==='goal'&&x.value.toLowerCase()!==main.value.toLowerCase()&&x.index>main.index && x.index-main.index<=5);
 return second ? limit(`${main.value} · ${second.value}`,130) : main.value;
}

// In 3. trinn, RØD is the child's group. These rules apply only to
// explicitly group-specific text; generic classroom info is retained.
const RED_GROUP={key:'rød',name:'Rød gruppe'};
const GROUP_WORDS=/\b(?:oransje|blå|grønn|gul|rød|rosa)\b/ig;
const TIME_RE=/\b(\d{1,2})[.:](\d{2})\b/g;
function clock(s){const m=String(s||'').match(/\b(\d{1,2})[.:](\d{2})\b/);return m?`${m[1].padStart(2,'0')}:${m[2]}`:null;}
function headerTime(s){const m=[...String(s||'').matchAll(TIME_RE)];return m.length>=2?`${m.at(-2)[1].padStart(2,'0')}:${m.at(-2)[2]}–${m.at(-1)[1].padStart(2,'0')}:${m.at(-1)[2]}`:null;}
function containsGroupOtherThanRed(text){
 if(!/\b(?:gruppe(?:r|ne|n)?|buss(?:en)?|møter(?:\s+kl)?)\b/i.test(text))return false;
 const groups=[...neat(text).matchAll(GROUP_WORDS)].map(m=>m[0].toLowerCase());
 return groups.length>0&&!groups.includes('rød');
}

// Read the *actual weekly swimming table*, distinguishing the two time
// columns (not just the shared sentence "svømming for alle"). Each week
// may have more than one set of Mon/Tue rows. Never carry over other weeks.
export function extractGroupSwimming(pages,week,group='rød'){
 const result={};
 for(const page of pages){
  const items=page.items||[];
  const heading=items.find(x=>/plan for svømming/i.test(neat(x.text)));
  if(!heading)continue;
  const headers=items.filter(x=>x.y>heading.y&&x.y<heading.y+85);
  const early=headers.find(x=>/08[.:]30\s*[-–]\s*10[.:]00/i.test(x.text))||headers.find(x=>/08[.:]30/i.test(x.text));
  const late=headers.find(x=>/12[.:]00\s*[-–]\s*13[.:]30/i.test(x.text))||headers.find(x=>/12[.:]00/i.test(x.text));
  if(!early||!late||late.x<=early.x+15)continue;
  // Derive times from the PDF headings, do not assume they repeat each week.
  const earlyText=headerTime(early.text);
  const lateText=headerTime(late.text);
  const morning=earlyText;
  const afternoon=lateText;
  const rows=items.filter(x=>x.y>Math.max(early.y,late.y)+4&&x.y<page.height-8&&/^(?:Mandag|Tirsdag)(?:\b|\s)/i.test(neat(x.text))).sort((a,b)=>a.y-b.y);
  let activeWeek=null;
  for(let i=0;i<rows.length;i++){
   const row=rows[i],bottom=rows[i+1]?.y??page.height-5;
   const around=items.filter(x=>Math.abs(x.y-row.y)<9&&x.x<row.x);
   const n=around.find(x=>/^\d{1,2}$/.test(neat(x.text)));
   if(n)activeWeek=Number(n.text);
   if(activeWeek!==week)continue;
   const day=/^mandag/i.test(row.text)?'Mandag':'Tirsdag';
   const rowItems=items.filter(x=>x.y>=row.y-5&&x.y<bottom-2);
   const separator=late.x-7;
   const morningText=neat(rowItems.filter(x=>x.x>=early.x-9&&x.x<separator).map(x=>x.text).join(' '));
   const afternoonText=neat(rowItems.filter(x=>x.x>=separator&&x.x<=page.width).map(x=>x.text).join(' '));
   // Only assign a slot if the actual group appears in that column.
   const re=new RegExp(`\\b${group}\\b`,'i');
   if(morning&&re.test(morningText))result[day]={period:morning,slot:'morning',source:'swimming-table'};
   else if(afternoon&&re.test(afternoonText))result[day]={period:afternoon,slot:'afternoon',source:'swimming-table'};
  }
 }
 return result;
}

// Early bus/meeting times are *group-specific*. Read the day column or
// the weekday-labelled notice; never show 08:05 just because another group
// meets then. Works independently of the weekly pool time table.
export function extractGroupMeetingTimes(pages,group='rød'){
 const result={};
 const dayWords={Mandag:/\bmandager?\s*:/i,Tirsdag:/\btirsdager?\s*:/i};
 for(const page of pages){
  const lines=orderedLines(page.items||[]);
  const full=lines.join(' ');
  for(const [day,dayRx] of Object.entries(dayWords)){
   const m=full.match(new RegExp(dayRx.source+'\\s*([\\s\\S]{0,210}?)(?=\\bDe øvrige\\b|\\b(?:Mandager|Tirsdager)\\s*:|$)', 'i'));
   const section=m?.[1]||'';
   if(new RegExp(`\\b${group}\\b`,'i').test(section)&&/møter|bussen|buss/i.test(section)){
    const t=clock(section);if(t)result[day]=t;
   }
  }
 }
 return result;
}

export function tailorThirdGradeRed(plan,pages=[]){
 if(plan.grade!=='3')return plan;
 const swimming=extractGroupSwimming(pages,plan.week);
 const meeting=extractGroupMeetingTimes(pages);
 const tailored=structuredClone(plan);
 tailored.group={...RED_GROUP};
 tailored.days=tailored.days||{};
 let unknownSwimmingDays=0;
 for(const day of DAYS){
  const d=tailored.days[day];if(!d)continue;
  const originals=d.events||[];
  const isSwimDay=!!swimming[day] || originals.some(e=>/svømm|badetøy|bussen går til svømmingen/i.test(`${e.title||''} ${e.detail||''}`)) ||
    ((day==='Mandag'||day==='Tirsdag')&&tailored.notices?.some(n=>/svømm[\s\S]{0,160}(?:mandag|tirsdag|begge dagene)/i.test(n.detail||'')));
  // Drop details aimed only at blue/green/yellow/... and replace swimming
  // fragments with an explicit red-group-only item. General events stay.
  const events=[];
  for(const e of originals){
   const full=neat(`${e.title||''} ${e.detail||''}`);
   if(/svømm|badetøy|buss(?:en)?\s+(?:går\s+)?til/i.test(full)){
    // Some PDF extractors merge the school concert after the swimming line.
    if(/(?:kulturelle skolesekken|\bDKS\b)/i.test(full)&&!events.some(x=>/kulturelle skolesekken/i.test(x.title)))
      events.push({time:(full.match(/10[.:]15/) ? '10:15':'Fra ukeplanen'),title:'Den kulturelle skolesekken',detail:'Fellesaktivitet oppført i ukeplanen.',icon:'sparkles',tone:'peach'});
    continue;
   }
   if(containsGroupOtherThanRed(full))continue;
   events.push(e);
  }
  if(isSwimDay){
   const slot=swimming[day];const bus=meeting[day];
   if(bus&&slot?.slot==='morning')events.unshift({time:bus,title:'Buss til svømming · Rød gruppe',detail:'Tidlig oppmøte for rød gruppe er oppgitt i ukeplanen.',icon:'bus',tone:'sky'});
   events.unshift({time:slot?.period||'Tid ikke bekreftet',title:'Svømming · Rød gruppe',
    detail:slot?`Rød gruppe har svømming ${slot.period}. ${slot.slot==='afternoon'?'Ikke den tidlige bussavgangen for andre grupper.':''}`.trim():
      'Svømming er oppført, men klokkeslett for rød gruppe kunne ikke leses sikkert. Sjekk original ukeplan.',
    icon:'waves',tone:'aqua'});
   // Retain only school-confirmed gear from the day list or swimming notice.
   const gearText=(tailored.notices||[]).filter(n=>/svømm|badetøy|håndkle/i.test(n.detail||'')).map(n=>n.detail).join(' ');
   const allPdfWords=pages.flatMap(p=>(p.items||[]).map(i=>i.text)).join(' ');
   const hairNeeded=/hårstrikk/i.test(gearText+' '+allPdfWords);
   const swimGear=[
     {label:'Badetøy',note:'Til svømming'},
     {label:'Håndkle',note:'Til svømming'},
     ...(hairNeeded?[{label:'Hårstrikk',note:'Ved langt hår'}]:[])
   ];
   const confirmed=uniqueByLabel([...(d.bring||[]),...gearFrom(gearText,['Badetøy','Håndkle','Hårstrikk']),...swimGear])
     .filter(item=>!['Penal','Skiftetøy'].includes(item.label));
   d.bring=confirmed;
   d.subtitle=slot?`Rød gruppe · svømming ${slot.period}`:'Rød gruppe · svømming (sjekk tid)';
   d.alert=`Rød gruppe: ${slot?`svømming ${slot.period}`:'sjekk svømmetid i PDF'}${bus&&slot?.slot==='morning'?` · Buss ${bus}`:''}${confirmed.length?' · Husk svømmeutstyret':''}`;
   if(!slot)unknownSwimmingDays++;
  } else {
   // If a day only mentioned someone else's early bus, remove that warning.
   if(containsGroupOtherThanRed(d.alert||''))d.alert=null;
   if(containsGroupOtherThanRed(d.subtitle||''))d.subtitle=events[0]?.title||'Felles undervisning';
  }
  // Keep timed events in actual order (e.g. buss 08:05, swimming 08:30).
  events.sort((a,b)=>{const aTime=clock(a.time),bTime=clock(b.time);return (aTime?Number(aTime.replace(':','')):9999)-(bTime?Number(bTime.replace(':','')):9999);});
  d.events=events.filter(e=>!PDF_NOISE.test(`${e.title||''} ${e.detail||''}`)&&!/\bsvg\b/i.test(`${e.title||''} ${e.detail||''}`));
  d.bring=(d.bring||[]).filter(x=>!['Penal','Skiftetøy'].includes(x.label));
 }
 const general=(tailored.notices||[]).filter(n=>{
  const v=`${n.title||''} ${n.detail||''}`;
  return !PDF_NOISE.test(v)&&!/\bsvg\b/i.test(v)&&!/svømm/i.test(v)&&!containsGroupOtherThanRed(v)&&!(/\b(?:mandager|tirsdager)\b/i.test(v)&&/\b(?:oransje|blå|grønn|gul|rød|rosa)\b/i.test(v));
 });
 if(Object.keys(swimming).length || unknownSwimmingDays){
  const details=['Mandag','Tirsdag'].filter(d=>swimming[d]||meeting[d]).map(d=>`${d}: ${swimming[d]?.period||'ukjent tidspunkt'}${meeting[d]&&swimming[d]?.slot==='morning'?` (buss ${meeting[d]})`:''}`);
  general.unshift({title:'Svømming · Rød gruppe',detail:details.length?details.join(' · '):'Se ukeplanen for rød gruppes svømmetider.',icon:'waves',tone:'aqua'});
 }
 tailored.notices=general;
 tailored.group.warning=unknownSwimmingDays>0?'En eller flere svømmetider for rød gruppe kunne ikke bekreftes. Sjekk original ukeplan.':null;
 if(unknownSwimmingDays>0){tailored.warning=[tailored.warning,tailored.group.warning].filter(Boolean).join(' ');tailored.status=tailored.status==='ok'?'partial':tailored.status;}
 return tailored;
}

export function analyzePdfPages(pages,grade,pdf,week,year,options={}){
 const cols=extractDayColumns(pages);
 const homework=extractHomework(pages);
 const learningGoals=extractLearningGoals(pages);
 const notices=extractNotices(pages);
 const days=buildDaily(cols,notices);
 for(const d of Object.values(days)){d.bring=(d.bring||[]).filter(x=>!['Penal','Skiftetøy'].includes(x.label));d.events=d.events.filter(e=>!PDF_NOISE.test(`${e.title||''} ${e.detail||''}`)&&!/\bsvg\b/i.test(`${e.title||''} ${e.detail||''}`));}
 const hasDayDetails=Object.values(days).some(d=>d.events.length||d.end);
 const hasInfo=hasDayDetails||homework.length||notices.length||learningGoals.length;
 const parsed = {
   grade,week,year,source:CLASS_URLS[grade],pdf,
   weekTheme:extractTheme(pages,grade),days,homework,learningGoals,notices,everyday:extractEveryday(pages),
   status:!hasInfo?'unreadable':(!hasDayDetails?'partial':'ok'),
   warning:!hasInfo?'Klarte ikke å lese teksten i ukeplanen. Åpne PDF-en for å se hele planen.':(!hasDayDetails?'Fant informasjon, men kunne ikke tolke dagskolonnene sikkert. Se originalplanen.': 'Automatisk utdrag – kontroller originalplanen for detaljer og endringer.'),
   parsedFromPdf:true,
 };
 return grade==='3' && options.redGroup === true ? tailorThirdGradeRed(parsed,pages) : parsed;
}

export function pdfItemsFromTextContent(textContent,viewWidth,viewHeight){
 const items=[];
 for(const item of textContent.items){
  if(typeof item.str!=='string'||!neat(item.str))continue;
  // PDF.js uses bottom-left origin. CSS-like coordinates place zero at the top.
  items.push({text:neat(item.str),x:Number(item.transform[4]),y:viewHeight-Number(item.transform[5]),width:Number(item.width)||0});
 }
 return {width:viewWidth,height:viewHeight,items};
}
