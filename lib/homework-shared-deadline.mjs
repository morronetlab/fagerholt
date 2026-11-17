/** Source-backed common deadline in a visually isolated homework section.
 * Only explicit "leveres senest <weekday>" within a HOMEWORK block may
 * assign a deadline. No school/week hard-coding, AI guesses or user data.
 * This is conservative: ambiguous layouts are left for parent review.
 */
const DAYS=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
const clean=s=>String(s??'').normalize('NFKC').replace(/\s+/gu,' ').trim();
const homeworkHeader=/^(?:lekser?|ukelekser?|lekseplan|hjemmearbeid|lekser denne uka|lekser denne uken)\s*:?$/iu;
const due=/\bleveres\s+senest\s+(mandag|tirsdag|onsdag|torsdag|fredag)\b/iu;
const subject=/^(?:(norsk|engelsk|matte|matematikk|lesing)\s*:\s*)?(.*)$/iu;
const actionable=/^(?:les\b|skriv\b|regn\b|gjør\b|øv\b|jobb\b|matteark\b|gloser\b|velg\s+\w*\s*oppgaver\b)/iu;
const reject=/\b(?:vaksine|planleggingsdag|skolen stengt|husk å ta med|kontakt|telefon|e-post|leksefri)\b/iu;
// PDF.js tends to emit line fragments; join only near-neighbour tokens on the
// same baseline, never across distant columns of an unrelated timetable.
export function sourceRows(page){
 const tokens=(page?.items||[]).filter(x=>Number.isFinite(x.x)&&Number.isFinite(x.y)&&clean(x.text))
  .sort((a,b)=>a.y-b.y||a.x-b.x);
 const lines=[];
 for(const t of tokens){
  const s=clean(t.text),last=lines.at(-1),width=Math.max(0,Number(t.width)||0);
  const gap=last?t.x-last.endX:Infinity;
  if(last&&Math.abs(t.y-last.y)<3&&gap>=-4&&gap<=Math.max(20,(page.width||600)*.06)){
   last.text+=(gap<=1.5?'':' ')+s;last.endX=Math.max(last.endX,t.x+width);
  }else lines.push({x:t.x,y:t.y,endX:t.x+width,text:s});
 }
 return lines;
}
export function extractHomeworkSharedDeadline(pages){
 const output=[],seen=new Set();
 for(let pi=0;pi<(Array.isArray(pages)?pages:[]).length;pi++){
  const page=pages[pi],rows=sourceRows(page);
  // Real PDF heading and the shared deadline may occupy one text baseline.
  // Require an explicit homework word AND the due phrase in the same row.
  const inlineDueHeader=/^(?:lekser?|hjemmearbeid)\b.{0,100}\bleveres\s+senest\s+(?:mandag|tirsdag|onsdag|torsdag|fredag)\b/iu;
  const headings=rows.filter(row=>homeworkHeader.test(row.text)||inlineDueHeader.test(row.text));
  if(!headings.length)continue;
  for(const heading of headings){
   const nextHeading=rows.filter(r=>r.y>heading.y+25&&homeworkHeader.test(r.text))
    .sort((a,b)=>a.y-b.y)[0];
   const end=Math.min(page.height||Infinity,heading.y+520,nextHeading?.y??Infinity);
   const region=rows.filter(r=>r.y>=heading.y&&r.y<end);
   const deadlineRows=region.filter(r=>due.test(r.text)&&
    !/\b(?:neste uke|forrige uke|ikke|unngå)\b/iu.test(r.text));
   // Two different explicit cutoffs are a real ambiguity, not permission to
   // assign all tasks to whichever weekday appears first.
   const days=[...new Set(deadlineRows.map(r=>r.text.match(due)[1].toLocaleLowerCase('nb-NO')))];
   if(days.length!==1)continue;
   const dueDay=DAYS.find(d=>d.toLocaleLowerCase('nb-NO')===days[0]);
   for(const row of region){
    if(row.y<=heading.y+3||due.test(row.text)||reject.test(row.text))continue;
    const match=clean(row.text).match(subject),body=clean(match?.[2]||'');
    if(!actionable.test(body)||body.length<8||body.length>210)continue;
    // Use only the actual PDF sentence; do not manufacture subject, homework
    // text or a task from an isolated vocabulary heading.
    const label=clean(row.text);
    const key=pi+'|'+dueDay+'|'+label.toLocaleLowerCase('nb-NO');
    if(seen.has(key))continue;
    seen.add(key);
    output.push({subject:match?.[1]||null,text:label,dueDay,
     sourcePage:pi+1,evidence:'explicit-shared-homework-deadline'});
   }
  }
 }
 return output;
}
