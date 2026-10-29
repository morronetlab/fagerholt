/** Parse application and test JS files without executing their logic. */
import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const roots=['lib','netlify/functions','public','scripts','tests'];
const extensions=/\.(?:js|mjs|cjs)$/;
const ignored=new Set(['node_modules','vendor','.git','dist']);
const files=[];
function gather(dir){
 for(const entry of readdirSync(dir,{withFileTypes:true})){
  if(ignored.has(entry.name))continue;
  const path=join(dir,entry.name);
  if(entry.isDirectory())gather(path);
  else if(entry.isFile()&&extensions.test(entry.name))files.push(path);
 }
}
for(const subdir of roots)gather(join(root,subdir));
files.sort();
let failed=false;
for(const file of files){
 const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
 if(result.status!==0){
  failed=true;
  console.error('Syntax check failed: '+relative(root,file));
  console.error(result.stderr||result.stdout||'Unknown parser failure');
 }
}
if(failed)process.exitCode=1;
else console.log('Syntax OK: '+files.length+' JavaScript files');
