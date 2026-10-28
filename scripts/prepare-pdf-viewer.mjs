/** Copy PDF.js into same-origin public assets during the Netlify build. */
import {copyFile,mkdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
const out='public/vendor';
await mkdir(out,{recursive:true});
for(const name of ['pdf.mjs','pdf.worker.mjs']){
 const src=join('node_modules','pdfjs-dist','legacy','build',name);
 await stat(src); await copyFile(src,join(out,name));
}
console.log('PDF.js reader assets copied to public/vendor');
