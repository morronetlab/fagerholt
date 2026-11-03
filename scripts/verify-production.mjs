/** Read-only production smoke test. Never sends administrator credentials. */
import {pathToFileURL} from 'node:url';
export async function verifyProduction({origin='https://www.skoleuka.no',expectedCommit,fetchImpl=fetch}={}){
 if(!/^[0-9a-f]{40}$/i.test(expectedCommit||''))throw Error('Expected full 40-character commit SHA');
 const base=new URL(origin);
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)
  throw Error('Production origin must be a clean HTTPS origin');
 const check=async (path,accept)=>fetchImpl(new URL(path,base),{method:'GET',redirect:'manual',cache:'no-store',headers:{Accept:accept}});
 const build=await check('/build-info.json','application/json');
 if(build.status!==200)throw Error('Build metadata unavailable: HTTP '+build.status);
 let data;try{data=await build.json();}catch{throw Error('Invalid build metadata JSON');}
 if(data?.commit?.toLowerCase()!==expectedCommit.toLowerCase())throw Error('Production commit does not match main: '+String(data?.commit||'unknown'));
 const page=await check('/drift/','text/html');
 if(page.status!==200)throw Error('Drift dashboard unavailable: HTTP '+page.status);
 const html=await page.text();
 if(!html.includes('<title>Driftsstatus')||!html.includes('/drift/drift.mjs'))throw Error('Drift dashboard assets missing');
 const api=await check('/api/operations-health','application/json');
 if(api.status!==401)throw Error('Unauthenticated operations API must return HTTP 401, got '+api.status);
 if(!/no-store/i.test(api.headers.get('cache-control')||''))throw Error('Operations API missing no-store');
 return {commit:expectedCommit.toLowerCase(),checks:['Build SHA matches','Drift HTML available','Private API denies anonymous access']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 verifyProduction({expectedCommit:process.argv[2]}).then(x=>{
  console.log('Production checks passed for '+x.commit);for(const check of x.checks)console.log('PASS '+check);
 }).catch(e=>{console.error('Production smoke test failed: '+e.message);process.exitCode=1;});
}
