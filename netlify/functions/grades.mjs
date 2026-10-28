/** Read-only metadata endpoint: schools and their official grade/class section links. */
import {siteConfig} from '../../public/site-config.mjs';
import {getSchool,locateGradeSections} from '../../lib/schools.mjs';
const answer=(json,status=200)=>new Response(JSON.stringify(json),{status,headers:{
 'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':status===200?'public, max-age=300, s-maxage=900':'no-store',
 'X-Content-Type-Options':'nosniff'
}});
async function html(url,fetchImpl){
 const u=new URL(url);
 if(u.protocol!=='https:'||!siteConfig.allowedSourceHosts.includes(u.hostname))throw new Error('Ugyldig kilde');
 const res=await fetchImpl(url,{headers:{'User-Agent':'Ukeplanen/1.0','Accept-Language':'nb-NO,nb;q=0.9'},
  redirect:'follow',signal:AbortSignal.timeout(12000)});
 if(!res.ok)throw new Error(`MinSkole HTTP ${res.status}`);
 const final=new URL(res.url||url);
 if(final.protocol!=='https:'||!siteConfig.allowedSourceHosts.includes(final.hostname))throw new Error('Uventet redirect');
 const contentLength=Number(res.headers.get('content-length')||0);
 if(contentLength>1_000_000)throw new Error('HTML too large');
 const bytes=await res.arrayBuffer();
 if(bytes.byteLength>1_000_000)throw new Error('HTML too large');
 return new TextDecoder().decode(bytes);
}
export function createGradesHandler({fetchImpl=fetch}={}){
 return async request=>{
  if(request.method!=='GET')return answer({error:'Kun GET støttes'},405);
  const schoolId=new URL(request.url).searchParams.get('school');
  const school=getSchool(schoolId);
  if(!school)return answer({error:'Ukjent skole'},400);
  const grades=await locateGradeSections(school,url=>html(url,fetchImpl));
  const options=Object.keys(grades).sort((a,b)=>Number(a[0])-Number(b[0])||a.localeCompare(b,'nb-NO'))
    .map(code=>({code,label:/^[1-7]$/.test(code)?`${code}. trinn`:`${code[0]}. trinn – gruppe ${code[1]}`}));
  return answer({schoolId:school.id,schoolName:school.name,homepage:school.homepage,grades:options,
    warning:options.length?'': 'Ingen trinnsider ble funnet på skolens offentlige MinSkole-nettsted.'});
 };
}
export default createGradesHandler();
