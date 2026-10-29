/**
 * Recover explicit bilingual glossary TABLES from the actual PDF.js text layout.
 * No guessing of translations: an English word is paired only with Norwegian
 * text appearing in the same source table row.
 */
const norm=s=>String(s??'').normalize('NFC').replace(/\s+/g,' ').trim();
const lower=s=>norm(s).toLocaleLowerCase('nb-NO');
const sourceWord=/^[\p{L}]+(?:['-][\p{L}]+)*(?: [\p{L}]+(?:['-][\p{L}]+)*){0,2}$/u;
const translationWord=/^[\p{L}]+(?:['-][\p{L}]+)*(?: [\p{L}]+(?:['-][\p{L}]+)*){0,3}$/u;
const validTranslation=s=>s.split(/\s*\/\s*/).every(x=>translationWord.test(x));
const heading=/^(?:engelske gloser|engelske ord|gloser)\s*:?\s*$/i;
const columnEn=/^english\s*:?$/i;
const columnNo=/^(?:norwegian|norsk)\s*:?$/i;
const nextSection=/^(?:lekser(?:\s+til)?|lekser og oppgaver|læringsmål|ukas mål)\b/i;
const byY=(a,b)=>a.y-b.y||a.x-b.x;

export function extractEnglishGlossaries(pages){
 const result=[];
 for(const page of Array.isArray(pages)?pages:[]){
  const tokens=(page?.items||[]).filter(t=>Number.isFinite(t.x)&&Number.isFinite(t.y)&&norm(t.text));
  // The heading may be split across several PDF tokens, but must exist on
  // this page; plain "English" school subjects do not trigger a word quiz.
  const pageText=tokens.map(t=>norm(t.text)).join(' ');
  if(!/(?:engelske\s+gloser|engelske\s+ord|gloser\s*:)/i.test(pageText))continue;
  const titles=tokens.filter(t=>heading.test(norm(t.text))).sort(byY);
  const headers=tokens.filter(t=>columnEn.test(norm(t.text))).sort(byY);
  for(const en of headers){
   const nb=tokens.filter(t=>columnNo.test(norm(t.text))&&t.x>en.x+14&&Math.abs(t.y-en.y)<12)
     .sort((a,b)=>a.x-b.x)[0];
   if(!nb)continue;
   const title=titles.filter(t=>t.y<en.y&&en.y-t.y<130).sort((a,b)=>b.y-a.y)[0];
   if(!title&&!/(?:engelske\s+gloser|engelske\s+ord)/i.test(pageText))continue;
   const gap=nb.x-en.x;
   const xMin=en.x-gap*0.85,xMid=en.x+gap*0.5,xMax=nb.x+gap*0.95;
   const end=tokens.filter(t=>t.y>en.y+12&&nextSection.test(norm(t.text)))
     .sort(byY)[0];
   const yMax=Math.min(end?.y??Infinity,en.y+360);
   const body=tokens.filter(t=>t.y>en.y+5&&t.y<yMax&&t.x>=xMin&&t.x<xMax&&
     !columnEn.test(norm(t.text))&&!columnNo.test(norm(t.text)));
   const lhs=body.filter(t=>t.x<xMid).sort(byY);
   const rhs=body.filter(t=>t.x>=xMid).sort(byY);
   // English column gives the row boundaries. The Norwegian cell may wrap
   // onto an additional line, so collect all right-cell tokens until next row.
   const rows=[];
   for(const t of lhs){
    const prev=rows.at(-1);
    if(prev&&Math.abs(prev.y-t.y)<5)prev.parts.push(t);
    else rows.push({y:t.y,parts:[t]});
   }
   const pairs=[];
   for(let idx=0;idx<rows.length;idx++){
    const row=rows[idx],next=rows[idx+1];
    const english=norm(row.parts.sort((a,b)=>a.x-b.x).map(x=>x.text).join(' '));
    const norwegian=norm(rhs.filter(t=>t.y>=row.y-5&&t.y<(next?.y??yMax)-5)
      .map(t=>t.text).join(' '));
    if(!sourceWord.test(english)||english.length>38||!validTranslation(norwegian)||norwegian.length>70)continue;
    if(lower(english)==='english'||lower(norwegian)==='norwegian')continue;
    pairs.push(english+' - '+norwegian);
   }
   if(pairs.length){
    const list={category:'Engelske gloser',text:[...new Set(pairs)].slice(0,35).join('\n')};
    if(!result.some(x=>x.text===list.text))result.push(list);
   }
  }
 }
 return result;
}
