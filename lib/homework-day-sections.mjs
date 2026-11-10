/**
 * Evidence from a vertically structured HOMEWORK section. Unlike a timetable,
 * day headings run down the same column beneath an explicit homework title.
 * No school, grade, ISO week, AI output, or guessed deadlines are referenced.
 *
 * Example:
 *   LEKSER
 *   Mandag
 *     Matte: Tell til hundre ...
 *   Tirsdag
 *     Norsk: Les i bok ...
 *   Onsdag
 *     Norsk: Les i bok ...
 */
const DAYS=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
const clean=s=>String(s??'').normalize('NFKC').replace(/\s+/g,' ').trim();
const norm=s=>clean(s).toLocaleLowerCase('nb-NO');
const title=/^(?:lekseplan|lekser?|ukelekser?|hjemmelekser?|hjemmearbeid|hjemmeoppgaver|ukas\s+utfordringer|ukens\s+utfordringer)(?:\s+(?:uke\s*\d+|og\s+oppgaver|for\s+\d+\.?\s*trinn))?\s*:?\s*$/i;
const boundary=/^(?:(?:info|leselekse)\s*:\s*$|(?:læringsmål|ukens?\s+mål|ukas\s+mål|skolefag|fag\s+denne\s+uka|på\s+skolen|dagsprogram|timeplan|beskjeder|informasjon|kontaktlærer|kontaktinformasjon)\b)/i;
const homeworkAction=/\b(?:les(?:e)?|skriv(?:e)?|regn(?:e)?|tell(?:e)?|gjør(?:e)?|øv(?:e)?|jobb(?:e)?|svar|løs(?:e)?|fargelegg|pugg|tegn|lever|fyll\s+ut)\b/i;
const subject=/^(norsk|matte|matematikk|engelsk|lesing|naturfag|krle|samfunnsfag|musikk|sosialt)\s*:\s*(.*)$/i;
const dateHeading=/^(?:lekser?\s+)?(?:til\s+)?(mandag|tirsdag|onsdag|torsdag|fredag)(?:\s+\d{1,2}(?:[./-]\d{1,2})?\.?)?\s*:?\s*$/i;
const day=s=>{
 const match=clean(s).match(dateHeading);
 return match?DAYS.find(x=>norm(x)===norm(match[1])):null;
};
function lines(tokens){
 const rows=[];
 for(const t of [...tokens].sort((a,b)=>a.y-b.y||a.x-b.x)){
  const existing=rows.at(-1),text=clean(t.text);
  if(existing&&Math.abs(existing.y-t.y)<=3){
   const gap=t.x-existing.endX;
   existing.text+=(gap>=-3&&gap<=1.5?'':' ')+text;
   existing.endX=Math.max(existing.endX,t.x+(Number(t.width)||0));
  }else rows.push({y:t.y,text,endX:t.x+(Number(t.width)||0)});
 }
 return rows.map(x=>x.text).filter(Boolean);
}
function homeworkTasks(contents,dayName,page,cell){
 const out=[];let current=null;
 const flush=()=>{
  if(!current)return;
  const assignment=clean(current.parts.join(' '));
  if(homeworkAction.test(assignment)&&assignment.length>=7)
   out.push({subject:current.subject,text:assignment,dueDay:dayName,
    sourcePage:page,cell,evidence:'homework-day-section'});
  current=null;
 };
 for(const line of contents){
  const text=clean(line);
  if(!text||/^(?:ingen\s+lekser?|leksefri|fri\s+fra\s+lekser?)\b/i.test(text))continue;
  if(/\b(?:\d{1,2}[.:]\d{2}\s*[-–]\s*\d{1,2}[.:]\d{2}|friminutt|skolestart|skoleslutt)\b/i.test(text))continue;
  const m=text.match(subject);
  if(m){
   flush();
   current={subject:m[1],parts:[m[2]]};
  }else if(current){
   // Lines below 'Matte:' may continue the same assignment. They are not
   // separate undated tasks (and must not disappear).
   current.parts.push(text);
  }else if(homeworkAction.test(text)){
   current={subject:null,parts:[text]};
  }
 }
 flush();
 return out;
}
export function extractHomeworkDaySections(pages){
 const output=[];
 for(let pi=0;pi<(Array.isArray(pages)?pages:[]).length;pi++){
  const page=pages[pi];
  if(!(page?.width>0&&page?.height>0))continue;
  const tokens=(page.items||[]).filter(t=>Number.isFinite(t.x)&&Number.isFinite(t.y)&&clean(t.text));
  // PDF text may split the heading into adjacent glyph runs ('L'+'ekser').
  // Join only tokens on the same visual baseline; never borrow a title
  // from an unrelated school timetable or another page.
  const titleRows=[];
  for(const token of [...tokens].sort((a,b)=>a.y-b.y||a.x-b.x)){
   const row=titleRows.at(-1);
   if(row&&Math.abs(row.y-token.y)<3){
    const gap=token.x-row.right;
    row.text+=(gap>=-2&&gap<=2?'':' ')+clean(token.text);
    row.right=Math.max(row.right,token.x+(Number(token.width)||0));
   }else titleRows.push({y:token.y,x:token.x,right:token.x+(Number(token.width)||0),text:clean(token.text)});
  }
  const titles=titleRows.filter(t=>title.test(t.text));
  const headers=tokens.filter(t=>day(t.text)).map(t=>({...t,day:day(t.text)}));
  if(!titles.length||headers.length<2)continue;
  for(const heading of titles){
   // The weekday stack must start promptly below the actual homework heading.
   // "Lekser" can be centred across a two-column table while the weekday
   // labels sit at the far-left edge. Their X positions must NOT be compared.
   const first=headers.filter(h=>h.y>heading.y+7&&h.y<heading.y+155)
    .sort((a,b)=>a.y-b.y)[0];
   if(!first)continue;
   const stop=Math.min(page.height-3,heading.y+630,
    ...tokens.filter(t=>t.y>first.y+14&&t.y<heading.y+650&&
      t.x<first.x+page.width*.18&&boundary.test(clean(t.text))).map(t=>t.y-4));
   const column=headers.filter(h=>h.y>=first.y&&h.y<stop&&
    Math.abs(h.x-first.x)<page.width*.07).sort((a,b)=>a.y-b.y);
   const days=[];
   for(const h of column){
    if(days.some(d=>Math.abs(d.y-h.y)<17)||days.some(d=>d.day===h.day))continue;
    days.push(h);
   }
   // One isolated weekday could be a regular lesson, not a deadline.
   if(days.length<2||days[1].y-days[0].y<20)continue;
   // Require a vertical sequence, not a 5-column horizontal timetable.
   if(days.some((h,i)=>i>0&&(h.y-days[i-1].y<20||h.y-days[i-1].y>290)))continue;
   // A second column may hold the actual homework. For example, a school's
   // official PDF has "Mandag" and "Norsk: Les ..." on the SAME text baseline,
   // with "Tur uten bål" in the narrow left-hand weekday column.
   // Anchor the homework column to subject labels in the rows, rather than
   // using the centred heading or classifying left-column notices as tasks.
   const anchors=tokens.filter(t=>t.y>=first.y-5&&t.y<stop&&
    t.x>first.x+Math.max(24,page.width*.065)&&
    /^(?:norsk|matte|matematikk|engelsk|lesing|naturfag|krle|samfunnsfag|musikk)\s*(?::|$)/i.test(clean(t.text)));
   const rightStart=anchors.length?Math.min(...anchors.map(t=>t.x))-7:null;
   for(let index=0;index<days.length;index++){
    const header=days[index];
    const end=index+1<days.length?days[index+1].y-4:stop;
    if(end<=header.y+11)continue;
    const right=Math.min(page.width-3,first.x+page.width*.86);
    const content=lines(tokens.filter(t=>t.y>=(rightStart!==null?header.y-4:header.y+5)&&t.y<end&&
     t.x>=(rightStart!==null?rightStart:Math.max(0,first.x-12))&&t.x<right));
    output.push(...homeworkTasks(content,header.day,pi+1,'section-'+index));
   }
  }
 }
 // Two headings or duplicate text tokens can describe one source task.
 const seen=new Set();
 return output.filter(item=>{
  const key=[item.sourcePage,item.dueDay,norm(item.subject),norm(item.text)].join('|');
  if(seen.has(key))return false;
  seen.add(key);return true;
 });
}
