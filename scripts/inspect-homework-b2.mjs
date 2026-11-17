/** Temporary, privacy-safe geometry diagnostics for reviewed Lovisenlund P1.
 * Prints ONLY pre-approved keyword categories and coordinates, never PDF text.
 */
import {createHash} from 'node:crypto';
import {officialFetch} from './collect-quality-originals.mjs';
import {pdfPages} from '../netlify/functions/plan.mjs';
import {ORIGINAL_PDF_GOLDENS} from '../tests/quality/original-pdf-goldens.mjs';
import {sourceRows} from '../lib/homework-shared-deadline.mjs';
const golden=ORIGINAL_PDF_GOLDENS.find(x=>x.id==='lovisenlund-4-w45-2026');
const bytes=await officialFetch(golden.url,{pdf:true});
const digest=createHash('sha256').update(bytes).digest('hex');
if(digest!==golden.sha256)throw Error('Verified original changed – cannot diagnose');
const pages=await pdfPages(bytes.slice());
const tags=[
 ['homework-title',/^(?:lekser?|ukelekser?|lekseplan|hjemmearbeid)\b/iu],
 ['due-verb',/\bleveres\b/iu],['due-limit',/\bsenest\b/iu],
 ['wednesday',/\bonsdag\b/iu],['reading',/\bside\s*135\b/iu],
 ['math',/\bmatteark\b|\bdivisjon\b/iu],['vocabulary',/\bgloser\b/iu]
];
for(let index=0;index<pages.length;index++){
 const rows=sourceRows(pages[index]);
 console.log('REVIEWED-GEOMETRY '+JSON.stringify({page:index+1,rows:rows.length,
  hits:rows.flatMap(r=>tags.filter(([,re])=>re.test(r.text)).map(([tag])=>({
   tag,x:Math.round(r.x/10)*10,y:Math.round(r.y/10)*10,
   len:r.text.length}))).slice(0,50)}));
}
