/** Verify individual school homework citations against the downloaded PDF text.
 * This is separate from the audit of exceptional workday/health notices:
 * missing one critical notice must not hide separately evidenced homework.
 */
const normalize=s=>String(s||'').normalize('NFKC').toLocaleLowerCase('nb-NO')
 .replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/gu,' ').trim();
const words=s=>[...new Set(normalize(s).split(' ').filter(w=>w.length>=3||/^\d{1,2}$/u.test(w)))];
const present=(word,page)=>new RegExp('(?:^| )'+word+'(?: |$)','u').test(page);
const common=new Set(['skal','den','det','til','fra','med','over','under','eller','som','for','alle','hver','uke','ukens','ukas','oppgave','lekse']);
const localEvidence=(text,task,taskWords)=>{
 if(task.length>=11&&text.includes(task))return true;
 const distinct=taskWords.filter(w=>!common.has(w));
 if(task.length<18||distinct.length<3)return false;
 const tokens=text.split(' ').filter(Boolean),span=Math.max(10,distinct.length*3);
 for(let i=0;i<tokens.length;i++){
  if(!distinct.includes(tokens[i]))continue;
  const nearby=new Set(tokens.slice(Math.max(0,i-3),i+span));
  if(distinct.filter(w=>nearby.has(w)).length/distinct.length>=0.9)return true;
 }
 return false;
};
export function homeworkMatchesPdf(item,pages){
 if(!item||!Array.isArray(pages)||!pages.length||!item.text)return false;
 const idx=Number(item.sourcePage);
 const texts=Number.isInteger(idx)&&idx>=1&&idx<=pages.length?
  [pages[idx-1]]:pages;
 const quote=normalize(item.sourceQuote||''),task=normalize(item.text);
 if(task.length<4)return false;
 const taskWords=words(task);
 if(!taskWords.length)return false;
 for(const page of texts){
  const text=normalize((page.items||[]).map(t=>t.text).join(' '));
  if(text.length<40)continue;
  // A canonical PDF table cell may not have an AI source quote.
  if(!quote){
   if(localEvidence(text,task,taskWords))return true;
   // Legacy canonical homework cells may be rearranged by PDF.js.
   if(Number.isInteger(idx)&&idx>=1&&idx<=pages.length&&
     taskWords.length>=3&&taskWords.filter(w=>present(w,text)).length/taskWords.length>=0.9)
    return true;
   continue;
  }
  const quoteWords=words(quote);
  if(quote.length<12||quoteWords.length<2)continue;
  // The claimed quote must actually describe this task.
  const overlap=taskWords.filter(w=>present(w,quote)).length;
  if(!overlap||overlap/taskWords.length<0.45)continue;
  // Prefer exact citation; allow text-layer reflow where words split across lines.
  const fromPdf=text.includes(quote)||
    quoteWords.length>=3&&quoteWords.filter(w=>present(w,text)).length/quoteWords.length>=0.85;
  if(fromPdf)return true;
 }
 return false;
}
export function markVerifiedHomework(plan,pages){
 return (Array.isArray(plan?.homework)?plan.homework:[]).map(item=>({
  ...item,digestSourceVerified:homeworkMatchesPdf(item,pages),
  digestDeadlineVerified:Boolean(item.dueDay&&(
   normalize(item.sourceQuote).includes('til '+normalize(item.dueDay))||
   plan.homeworkSourceVerified===true&&Number.isInteger(item.sourcePage)))
 }));
}
