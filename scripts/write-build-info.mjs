/** Embed the actual Git commit into the static Netlify site at build time. */
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export function buildCommit(env=process.env,git=()=>execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',timeout:2000}).trim()){
 let commit=env.COMMIT_REF||env.GITHUB_SHA||'';
 if(!/^[a-f0-9]{40}$/i.test(commit)){
  try{commit=git();}catch{commit='';}
 }
 return /^[a-f0-9]{40}$/i.test(commit)?commit.toLowerCase():null;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const commit=buildCommit();
 writeFileSync(new URL('../public/build-info.json',import.meta.url),JSON.stringify({commit})+'\n','utf8');
 console.info('Ukeplanen build commit:',commit||'unavailable');
}
