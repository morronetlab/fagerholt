/** Recover actual Norwegian exercise words from a labeled PDF column.
 * Unlike flattened PDF text, coordinates prevent words from the adjacent
 * learning-goal and message columns from being mistaken for vocabulary.
 */
const tidy=s=>String(s??'').normalize('NFC').replace(/\s+/g,' ').trim();
const heading=/^(?:(?:ukas|ukens)\s+)?øveord\s*:?\s*$/iu;
const sourceWord=/^\p{L}{2,32}(?:[-']\p{L}{2,32})?$/u;
const otherSection=/^(?:ukas|ukens)\s+(?:mål|tema)|^(?:læringsmål|beskjeder|lekser?\s+til|kontaktlærere?|engelske\s+ord|engelske\s+gloser)\b/iu;

export function extractNorwegianWordLists(pages){
 const output=[];
 for(const page of Array.isArray(pages)?pages:[]){
  const {width=0,height=0}=page||{};
  if(!width||!height)continue;
  const tokens=(page.items||[])
   .filter(t=>Number.isFinite(t.x)&&Number.isFinite(t.y)&&tidy(t.text))
   .sort((a,b)=>a.y-b.y||a.x-b.x);
  const headers=[];
  for(let i=0;i<tokens.length;i++){
   const t=tokens[i],label=tidy(t.text);
   if(heading.test(label))headers.push(t);
   else if(/^(?:ukas|ukens)$/iu.test(label)){
    const next=tokens.find(x=>x!==t&&Math.abs(x.y-t.y)<5&&
      x.x>=t.x&&x.x-t.x<Math.max(100,width*.15)&&/^øveord\s*:?$/iu.test(tidy(x.text)));
    if(next)headers.push(t);
   }
  }
  for(const header of headers){
   // The original 2nd-grade PDF has the word list in its own vertical
   // column, with "Ukas mål" immediately to the right. Extract only text
   // beginning near the word-list heading, never the neighbouring column.
   const left=header.x-Math.max(10,width*.015);
   const right=header.x+Math.max(34,width*.06);
   const stop=tokens.filter(t=>t.y>header.y+5&&t.x>=left&&t.x<right&&
     otherSection.test(tidy(t.text))).sort((a,b)=>a.y-b.y)[0];
   const bottom=Math.min(header.y+height*.36,stop?.y??Infinity);
   const found=[];
   for(const t of tokens){
    if(t.y<=header.y+5||t.y>=bottom||t.x<left||t.x>=right)continue;
    const value=tidy(t.text);
    // Support a PDF token combining a small set of word-only rows; never
    // split a sentence or accept words from a long paragraph.
    const parts=value.split(/\s+/);
    if(parts.length>12||!parts.every(w=>sourceWord.test(w)))continue;
    for(const part of parts)if(!found.some(w=>w.toLocaleLowerCase('nb-NO')===part.toLocaleLowerCase('nb-NO')))
     found.push(part);
   }
   if(found.length>=2){
    const list={category:'Ukas øveord',text:found.slice(0,35).join('\n')};
    if(!output.some(x=>x.text===list.text))output.push(list);
   }
  }
 }
 return output;
}
