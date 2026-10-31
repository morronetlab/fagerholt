/** Verify individual school homework citations against the downloaded PDF text.
 * This is separate from the audit of exceptional workday/health notices:
 * missing one critical notice must not hide separately evidenced homework.
 */
const normalize=s=>String(s||'').normalize('NFKC').toLocaleLowerCase('nb-NO')
 .replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/gu,' ').trim();
const words=s=>[...new Set(normalize(s).split(' ').filter(w=>w.length>=3||/^\d{1,2}$/u.test(w)))];
const present=(word,page)=>new RegExp('(?:^| )'+word+'(?: |$)','u').test(page);
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
   if(!Number.isInteger(idx)||idx<1||idx>pages.length)continue;
   if(text.includes(task)||taskWords.length>=2&&taskWords.filter(w=>present(w,text)).length/taskWords.length>=0.85)
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
  ...item,digestSourceVerified:homeworkMatchesPdf(item,pages)
 }));
}
