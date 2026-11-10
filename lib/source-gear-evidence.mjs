/** Conservative equipment extraction from the actual PDF's positioned text.
 * A table's heading column, not adjacent prose, supplies the weekday.
 */
import {extractHomeworkEvidenceCells} from './homework-source-truth.mjs';
import {extractExplicitSchoolPacking} from './packing-source.mjs';
export const SOURCE_PACKING_EVIDENCE_VERSION=2;

const DAYS=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
const clean=s=>String(s||'').normalize('NFKC').replace(/\s+/gu,' ').trim();
const namedGear=[
 ['Gymsko',/\b(?:gymsko|innesko)\b/iu],
 ['Gymtøy',/\b(?:gymtøy|gymklær|treningstøy)\b/iu],
 ['Håndkle',/\bhåndkle\b/iu],
 ['Såpe',/\bsåpe\b/iu],
 ['Blyant',/\b(?:blyant|blyanter)\b/iu],
 ['Viskelær',/\bviskelær\b/iu],
 ['Zeppelin lesebok',/\bzeppel(?:in|lin)\b/iu],
 ['Skrivebok',/\bskrivebok(?:a|en)?\b/iu],
 ['Biblioteksbok',/\bbiblioteksbok(?:a|en)?\b/iu],
 ['Flaskeposten',/\bflaskeposten\b/iu]
];
const command=/\b(?:ta\s+med|ha\s+med|husk\s+(?!å\s+(?:les|skriv|gjør|øv))|pakk(?:e)?|legg\s+i\s+sekken)\b/iu;
const optional=/\b(?:kan|gjerne|valgfritt|frivillig|hvis\s+du\s+har|hvis\s+dere\s+har|har\s+lyst)\b/iu;
function itemsFrom(text,{day,sourcePage}){
 const found=[],sentence=clean(text);
 // Only words within this explicit instruction qualify; do not borrow an
 // unrelated 'Husk' from another paragraph or neighboring PDF column.
 if(!command.test(sentence))return found;
 const tail=sentence.slice(sentence.search(command));
 for(const [label,re] of namedGear){
  if(!re.test(tail))continue;
  const i=tail.search(re);
  const near=tail.slice(Math.max(0,i-65),i+50);
  const name=optional.test(near)?label+' (valgfritt)':label;
  const every=/\b(?:hver\s+eneste\s+dag|hver\s+dag|daglig|alle\s+(?:skole)?dager)\b/iu.test(tail);
  for(const d of every?DAYS:[day]){
   if(d)found.push({day:d,label:name,sourcePage});
  }
 }
 return found;
}
function dayColumnPacking(pages){
 const out=[];
 for(let pi=0;pi<(pages||[]).length;pi++){
  const page=pages[pi];
  if(!(page?.width>0&&page?.height>0))continue;
  const tokens=(page.items||[]).filter(t=>Number.isFinite(t.x)&&Number.isFinite(t.y)&&clean(t.text));
  const headers=tokens.filter(t=>DAYS.some(d=>clean(t.text).toLowerCase()===d.toLowerCase()));
  for(const first of headers.filter(t=>clean(t.text).toLowerCase()==='mandag')){
   const row=[first];
   for(const day of DAYS.slice(1)){
    const next=headers.find(t=>clean(t.text).toLowerCase()===day.toLowerCase()&&
      Math.abs(t.y-first.y)<4&&t.x>row.at(-1).x+25);
    if(!next)break;row.push(next);
   }
   if(row.length!==5)continue;
   const boundaries=[Math.max(0,row[0].x-(row[1].x-row[0].x)*.48),
    ...row.slice(1).map((h,i)=>(row[i].x+h.x)/2),
    Math.min(page.width,row[4].x+(row[4].x-row[3].x)*.55)];
   for(let di=0;di<5;di++){
    const cell=tokens.filter(t=>t.x>=boundaries[di]&&t.x<boundaries[di+1]&&
     t.y>first.y+12&&t.y<Math.min(page.height,first.y+180))
     .sort((a,b)=>a.y-b.y||a.x-b.x);
    const rows=[];
    for(const t of cell){
     const prev=rows.at(-1);
     if(prev&&Math.abs(prev.y-t.y)<3)prev.parts.push(t);
     else rows.push({y:t.y,parts:[t]});
    }
    for(const row of rows){
     const line=row.parts.sort((a,b)=>a.x-b.x).map(x=>x.text).join(' ');
     out.push(...itemsFrom(line,{day:DAYS[di],sourcePage:pi+1}));
    }
   }
  }
 }
 return out;
}
function homeworkPacking(pages){
 const found=[];
 for(const cell of extractHomeworkEvidenceCells(pages)){
  // Source geometry already proved the column/weekday. A notice may follow
  // an exercise in the same cell, so inspect each explicit instruction.
  const text=clean(cell.text);
  const spans=text.match(/(?:ta\s+med|ha\s+med|husk\s+(?!å\s+(?:les|skriv|gjør|øv)))[^.!?]{0,140}/giu)||[];
  for(const span of spans)found.push(...itemsFrom(span,{day:cell.dueDay,sourcePage:cell.sourcePage}));
 }
 return found;
}
export function verifiedSchoolPacking(pages){
 const combined=[...extractExplicitSchoolPacking(pages),...dayColumnPacking(pages),...homeworkPacking(pages)];
 const seen=new Set();
 return combined.filter(item=>{
  const key=item.day+'|'+item.label.replace(/\s*\(valgfritt\)$/iu,'').toLowerCase();
  if(seen.has(key))return false;seen.add(key);return true;
 });
}
export function mergeVerifiedPacking(days,items){
 if(!days||typeof days!=='object'||!items?.length)return days;
 const next={...days};
 for(const item of items){
  const original=next[item.day];
  if(!original||!Array.isArray(original.bring))continue;
  if(next[item.day]===days[item.day])next[item.day]={...original,bring:original.bring.map(x=>({...x}))};
  const bring=next[item.day].bring;
  const simple=s=>String(s||'').replace(/\s*\(valgfritt\)$/iu,'').toLocaleLowerCase('nb-NO');
  const existing=bring.find(x=>simple(x.label)===simple(item.label));
  if(existing){if(item.label.endsWith('(valgfritt)'))existing.label=item.label;}
  else bring.push({label:item.label});
 }
 return next;
}
