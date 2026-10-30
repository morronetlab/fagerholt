/** Independent source integrity check using actual, public MinSkole PDF bytes.
 * Run: node scripts/verify-practical-original-pdfs.mjs
 * Fail loudly if a source is not reachable/readable; CI marks this optional
 * external-source step separately, never pretending an inaccessible PDF passed.
 */
import assert from 'node:assert/strict';
import {pdfPages} from '../netlify/functions/plan.mjs';
import {adultImpactType} from '../public/shared/adult-impact.mjs';

const targets=[
 {school:'Sjøstrand 2',year:2026,week:44,
  url:'https://www.minskole.no/DynamicContent//Documents/866-Sjostrand-Ukebrev-uke-44-ca300aa3-539e.pdf',
  checks:[
   {all:['vaksin','onsdag'],kind:'health'},
   {all:['ta med','gymsko'],kind:'gear'}
  ]},
 {school:'Fagerholt 4',year:2026,week:44,
  url:'https://www.minskole.no/DynamicContent//Documents/854-fagerholt-Ukeplan-uke-44-93c849fa-ad01.pdf',
  checks:[{all:['uke','44'],kind:'week-label'}]},
 {school:'Tordenskjolds gate 6',year:2026,week:44,
  url:'https://www.minskole.no/DynamicContent//Documents/863-todda-Uke-44-.-c350c815-359d.pdf',
  checks:[{all:['naturfag','norsk','matte'],kind:'homework-fields'}]},
 {school:'Voiebyen 5',year:2024,week:44,
  url:'https://www.minskole.no/DynamicContent//Documents/864-voiebyen-Ukeplan-uke-44-dd1c256c-7eb1.pdf',
  checks:[
   {all:['planlegger','tur'],kind:'undated-activity'}
  ]}
];
let passed=0,failed=0;
for(const target of targets){
 try{
  const response=await fetch(target.url,{headers:{
   'User-Agent':'Skoleuka source QA (+https://github.com/morronetlab/fagerholt)',
   Accept:'application/pdf'
  },signal:AbortSignal.timeout(24000)});
  assert.equal(response.ok,true,'Official PDF HTTP '+response.status);
  const data=new Uint8Array(await response.arrayBuffer());
  assert.equal(new TextDecoder('ascii').decode(data.slice(0,4)),'%PDF');
  const pages=await pdfPages(data);
  const text=pages.map(p=>(p.items||[]).map(item=>item.text||'').join(' '))
   .join(' ').normalize('NFKC').toLocaleLowerCase('nb-NO').replace(/\s+/gu,' ');
  assert.ok(text.length>80,'No usable PDF text layer: cannot verify source text');
  for(const check of target.checks){
   assert.ok(check.all.every(fragment=>text.includes(fragment)),
    'Missing original source words for '+check.kind+': '+check.all.join(', '));
  }
  if(target.school.startsWith('Voiebyen')){
   // The PDF explicitly says the trip day has NOT been decided yet.
   // Do not turn that into an equipment reminder or a dated deadline.
   assert.equal(adultImpactType('Vi planlegger en tur i løpet av uka'),null);
  }
  console.info('VERIFIED REAL PDF',JSON.stringify({school:target.school,year:target.year,
   week:target.week,pages:pages.length,characters:text.length,url:target.url}));
  passed++;
 }catch(error){
  failed++;
  console.error('UNVERIFIED ORIGINAL PDF',JSON.stringify({school:target.school,
   year:target.year,week:target.week,url:target.url,
   reason:String(error.message||error).slice(0,220)}));
 }
}
console.log(JSON.stringify({realPdfsVerified:passed,realPdfsUnverified:failed}));
if(failed)process.exitCode=1;
