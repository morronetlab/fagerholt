/** Local developer diagnostics for a school PDF already downloaded to disk.
 * Usage: node scripts/inspect-pdf.mjs 4 path/to/ukeplan.pdf 44 2026
 * This script does not fetch external URLs, and never substitutes sample data.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pdfPages} from '../netlify/functions/plan.mjs';
import {analyzePdfPages} from '../lib/plan-core.mjs';
import {siteConfig} from '../public/site-config.mjs';

const [grade,path,weekRaw,yearRaw]=process.argv.slice(2);
if(!siteConfig.school.grades[grade]||!path||!Number.isInteger(Number(weekRaw))||Number(weekRaw)<1||Number(weekRaw)>53||!/^\d{4}$/.test(yearRaw||'')) {
  process.stderr.write('Usage: node scripts/inspect-pdf.mjs <grade 1-7> <downloaded.pdf> <week 1-53> <year>\n');
  process.exit(2);
}
const bytes=new Uint8Array(readFileSync(resolve(path)));
const pages=await pdfPages(bytes);
const textChars=pages.reduce((sum,page)=>sum+page.items.reduce((n,item)=>n+item.text.length,0),0);
const source=siteConfig.school.grades[grade];
const parsed=analyzePdfPages(pages,grade,null,Number(weekRaw),Number(yearRaw),source);
process.stdout.write(JSON.stringify({
  file:resolve(path),pageCount:pages.length,textChars,
  hasTextLayer:textChars>=20,
  ...parsed
},null,2)+'\n');
