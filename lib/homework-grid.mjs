/**
 * Source-authoritative deadlines in PDF homework matrices.
 * A due day belongs to a COLUMN, not to a sentence or a page.
 * Keep repeated column labels (two "Til torsdag" columns are valid).
 */
const DAYS=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
const tidy=s=>String(s??'').normalize('NFKC').replace(/\s+/g,' ').trim();
const day=s=>{const match=tidy(s).match(/^til\s+(mandag|tirsdag|onsdag|torsdag|fredag)\s*:?$/i);
 return match?DAYS.find(d=>d.toLocaleLowerCase('nb-NO')===match[1].toLocaleLowerCase('nb-NO')):null;};
const weekEnd=/^(?:ukelekse(?:r)?|ukens? lekse|beskjeder(?: og informasjon)?|informasjon|læringsmål|kontakt(?:informasjon)?|hilsen)\b/i;
const gridTitle=/^(?:lekser?(?:\s+(?:uke\s*\d+|og oppgaver|til\s+\w+))?|lekseplan|hjemmearbeid|ukas utfordringer|ukens utfordringer)\b/i;
const subject=/^(norsk|engelsk|matematikk|matte|naturfag|krle|samfunnsfag|lesing|musikk|sosialt)\s*:?\s*(.*)$/i;
const textKey=s=>tidy(s).toLocaleLowerCase('nb-NO').replace(/[^a-zæøå0-9]+/g,' ').trim();
const stop=new Set('jeg du vi dere de det denne dette som skal kan har den hun han til fra over med under les skriv på og eller en et i av er å om for så den der slik sine din boka bok oppgave oppgavene'.split(' '));
const useful=s=>[...new Set(textKey(s).split(' ').filter(w=>w.length>=3&&!stop.has(w)))];

function joinedLines(tokens){
 const rows=[];
 for(const t of [...tokens].sort((a,b)=>a.y-b.y||a.x-b.x)){
  const last=rows.at(-1);
  if(last&&Math.abs(last.y-t.y)<3){
   last.text+=' '+tidy(t.text);
  }else rows.push({y:t.y,text:tidy(t.text)});
 }
 return rows.map(x=>x.text).filter(Boolean);
}
function headerTokens(tokens){
 const headers=[];
 for(const t of tokens){
  if(day(t.text)){headers.push({x:t.x,y:t.y,dueDay:day(t.text)});continue;}
  if(!/^til\s*:?$/i.test(tidy(t.text)))continue;
  const next=tokens.filter(n=>n!==t&&Math.abs(n.y-t.y)<5&&n.x>=t.x&&n.x-t.x<70&&
     /^(?:mandag|tirsdag|onsdag|torsdag|fredag)\s*:?$/i.test(tidy(n.text)))
    .sort((a,b)=>a.x-b.x)[0];
  if(next)headers.push({x:t.x,y:t.y,dueDay:day('Til '+next.text)});
 }
 return headers.sort((a,b)=>a.y-b.y||a.x-b.x);
}
function tasksFromCell(lines,header){
 if(!lines.length||/^(?:leksefri|ingen lekse|fri fra lekser)\b/i.test(lines.join(' ')))return [];
 const tasks=[];let current=null;
 const flush=()=>{if(current?.parts.length){
   const text=tidy(current.parts.join(' '));
   if(text.length>6)tasks.push({dueDay:header.dueDay,subject:current.subject,text,sourcePage:header.sourcePage,cell:header.cell});
  }};
 for(const line of lines){
  const m=tidy(line).match(subject);
  if(m){
   flush();current={subject:m[1],parts:m[2]?[m[2]]:[]};
  }else if(current)current.parts.push(line);
  else current={subject:null,parts:[line]};
 }
 flush();
 return tasks.filter(t=>!/^(?:leksefri|ingen lekse)\b/i.test(t.text));
}
/** Return only tasks whose source page has a multi-column homework table. */
export function extractHomeworkDeadlineCells(pages){
 const output=[];
 for(let pi=0;pi<(pages||[]).length;pi++){
  const page=pages[pi];
  const tokens=(page?.items||[]).filter(t=>Number.isFinite(t.x)&&Number.isFinite(t.y)&&tidy(t.text));
  if(!tokens.length||!(page.width>0&&page.height>0))continue;
  const headers=headerTokens(tokens);
  const rows=[];
  for(const h of headers){
   let cluster=rows.find(r=>Math.abs(r.y-h.y)<10);
   if(!cluster)rows.push(cluster={y:h.y,headers:[]});
   if(!cluster.headers.some(x=>Math.abs(x.x-h.x)<6))cluster.headers.push(h);
  }
  for(const row of rows){
   const columns=row.headers.sort((a,b)=>a.x-b.x);
   if(columns.length<2||columns.some((h,i)=>i>0&&h.x-columns[i-1].x<page.width*.08))continue;
   const title=tokens.some(t=>gridTitle.test(tidy(t.text))&&t.y<row.y&&row.y-t.y<170);
   if(!title&&columns.length<3)continue;
   const start=Math.max(...columns.map(x=>x.y))+6;
   const boundaries=tokens.filter(t=>t.y>start+18&&weekEnd.test(tidy(t.text))&&t.x<columns[0].x+page.width*.12);
   const laterHead=tokens.filter(t=>t.y>start+18&&gridTitle.test(tidy(t.text))&&t.x<columns[0].x+page.width*.12);
   const end=Math.min(page.height-2,...[...boundaries,...laterHead].map(t=>t.y-3));
   if(end<start+16)continue;
   // Labels are *not* de-duplicated by day; physical x-coordinate is identity.
   for(let ci=0;ci<columns.length;ci++){
    const h=columns[ci],right=ci+1<columns.length?columns[ci+1].x-7:page.width-2;
    const left=h.x-9;
    const lines=joinedLines(tokens.filter(t=>t.x>=left&&t.x<right&&t.y>start&&t.y<end));
    output.push(...tasksFromCell(lines,{...h,sourcePage:pi+1,cell:ci}));
   }
   // The next table on this page, if present, must be discovered separately.
  }
 }
 return output;
}
/**
 * Match a specific task to its own documented source cell, not merely to a
 * weekday string somewhere on the page. Returns null when it is ambiguous.
 */
export function dueDayFromHomeworkCells(task,cells){
 if(!task||!cells?.length)return null;
 const matchingPage=Number.isInteger(task.sourcePage)
   ?cells.filter(c=>c.sourcePage===task.sourcePage):cells;
 if(!matchingPage.length)return null;
 const subj=textKey(task.subject||'').replace(/^til (?:mandag|tirsdag|onsdag|torsdag|fredag)/,'').trim();
 const taskWords=useful(task.text);
 if(taskWords.length<2)return null;
 const scored=matchingPage.map(c=>{
  const cellWords=new Set(useful(c.text));
  const shared=taskWords.filter(w=>cellWords.has(w));
  const fraction=shared.length/taskWords.length;
  const exactSubject=subj&&textKey(c.subject||'')===subj;
  const mismatch=subj&&c.subject&&textKey(c.subject)!==subj&&
    /^(norsk|engelsk|matte|matematikk|naturfag|krle|samfunnsfag)$/.test(subj);
  return {cell:c,score:fraction+(exactSubject?.2:0)-(mismatch?.5:0),
    count:shared.length,fraction};
 }).filter(x=>x.count>=2&&x.fraction>=.54&&x.score>=.58)
  .sort((a,b)=>b.score-a.score);
 if(!scored.length)return null;
 const best=scored[0];
 // Different days with nearly equal evidence -> no defensible due date.
 if(scored.some(x=>x.cell.dueDay!==best.cell.dueDay&&x.score>best.score-.18))return null;
 return best.cell.dueDay;
}
export function cellMatchesHomework(task,cell){
 // A null due date means no column deadline; null===null is NOT a match.
 return Boolean(cell?.dueDay)&&dueDayFromHomeworkCells(task,[cell])===cell.dueDay;
}

/** Source-backed, undated weekly tasks below a deadline matrix. */
export function extractUndatedWeeklyHomework(pages){
 const result=[];
 for(let i=0;i<(pages||[]).length;i++){
  const p=pages[i],tokens=(p?.items||[]).filter(t=>Number.isFinite(t.x)&&Number.isFinite(t.y)&&tidy(t.text));
  for(const heading of tokens.filter(t=>/^ukelekse(?:r)?\s*:?$/i.test(tidy(t.text)))){
   const next=tokens.filter(t=>t.y>heading.y+8&&(weekEnd.test(tidy(t.text))||gridTitle.test(tidy(t.text))))
      .sort((a,b)=>a.y-b.y)[0];
   const bottom=Math.min(heading.y+140,next?.y??Infinity,p.height||Infinity);
   const lines=joinedLines(tokens.filter(t=>t.y>heading.y+7&&t.y<bottom&&t.x>=heading.x-12));
   result.push(...tasksFromCell(lines,{dueDay:null,sourcePage:i+1,cell:'weekly'}));
  }
 }
 return result;
}
