/** Recover actual Norwegian exercise words from a labeled PDF column.
 * Unlike flattened PDF text, coordinates prevent words from the adjacent
 * learning-goal and message columns from being mistaken for vocabulary.
 */
const tidy=s=>String(s??'').normalize('NFC').replace(/\s+/g,' ').trim();
const heading=/^(?:(?:ukas|ukens)\s+(?:ord|øveord)|norske?\s+(?:øveord|gloser)|øveord)\s*:?\s*$/iu;
const sourceWord=/^\p{L}{2,32}(?:[-']\p{L}{2,32})?$/u;
const otherSection=/^(?:(?:ukas|ukens)\s+(?:mål|tema)|læringsmål|beskjeder|lekser?\s+til|kontaktlærere?|engelske\s+ord|engelske\s+gloser)\b/iu;

export function extractNorwegianWordLists(pages){
 const output=[];
 for(const page of Array.isArray(pages)?pages:[]){
  const {width=0,height=0}=page||{};
  if(!width||!height)continue;
  const fragments=(page.items||[])
   .filter(t=>Number.isFinite(t.x)&&Number.isFinite(t.y)&&tidy(t.text))
   .sort((a,b)=>a.y-b.y||a.x-b.x);
  // PDF.js may emit "Ukas", "øve", "ord:" and even "s", "kjegg"
  // as independent fragments. Reconstruct each visual line using its
  // actual coordinates and font widths, without joining adjacent columns.
  const tokens=[];
  for(const frag of fragments){
   const last=tokens.at(-1);
   const gap=last?frag.x-last.endX:Infinity;
   if(last&&Math.abs(frag.y-last.y)<3&&gap>=-3&&gap<Math.max(20,width*.025)){
    const space=/^(?:ukas|ukens)$/iu.test(last.text)||gap>3.5?' ':'';
    last.text+=space+tidy(frag.text);
    last.endX=Math.max(last.endX,frag.x+(frag.width||0));
   }else tokens.push({...frag,text:tidy(frag.text),endX:frag.x+(frag.width||0)});
  }
  const headers=[];
  for(let i=0;i<tokens.length;i++){
   const t=tokens[i],label=tidy(t.text);
   if(heading.test(label))headers.push(t);
   else if(/^(?:ukas|ukens|norske?)$/iu.test(label)){
    const next=tokens.find(x=>x!==t&&Math.abs(x.y-t.y)<5&&
      x.x>=t.x&&x.x-t.x<Math.max(110,width*.18)&&/^(?:ord|øveord|gloser)\s*:?$/iu.test(tidy(x.text)));
    if(next)headers.push(t);
   }
  }
  for(const header of headers){
   // The original 2nd-grade PDF has the word list in its own vertical
   // column, with "Ukas mål" immediately to the right. Extract only text
   // beginning near the word-list heading, never the neighbouring column.
   const left=header.x-Math.max(12,width*.025);
   // The Nygård column centers its words. Stop before adjacent labelled
   // sections (notably "Ukas mål" and English glossaries).
   const nextColumn=tokens.filter(t=>t!==header&&Math.abs(t.y-header.y)<12&&
     t.x>header.x+35&&(heading.test(tidy(t.text))||otherSection.test(tidy(t.text))))
     .sort((a,b)=>a.x-b.x)[0];
   const right=Math.min(header.x+Math.max(110,width*.24),
     nextColumn?nextColumn.x-Math.max(12,width*.02):Infinity);
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
    const list={category:/^norske?/iu.test(tidy(header.text))?'Norske øveord':'Ukas øveord',
      text:found.slice(0,35).join('\n')};
    if(!output.some(x=>x.text===list.text))output.push(list);
   }
  }
 }
 return output;
}
