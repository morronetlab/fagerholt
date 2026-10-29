/** Manual/PR-source check: live original PDF from Tordenskjolds gate skole, 6th grade, week 44. */
import assert from 'node:assert/strict';
import {pdfPages} from '../netlify/functions/plan.mjs';
import {extractHomeworkDeadlineCells,extractUndatedWeeklyHomework} from '../lib/homework-grid.mjs';

const url='https://www.minskole.no/DynamicContent//Documents/863-todda-Uke-44-.-c350c815-359d.pdf';
const response=await fetch(url,{
 headers:{'User-Agent':'Ukeplanen/1.0 (+https://ukeplanen.netlify.app)',Accept:'application/pdf'},
 signal:AbortSignal.timeout(35000)
});
assert.equal(response.ok,true,'The official school PDF must be reachable');
const bytes=new Uint8Array(await response.arrayBuffer());
assert.ok(bytes.length>1000&&String.fromCharCode(...bytes.slice(0,4))==='%PDF','Expected original PDF bytes');
const pages=await pdfPages(bytes);
assert.ok(pages.length>=1,'Original PDF has a readable text layer');
const cells=extractHomeworkDeadlineCells(pages);
console.log('Official source PDF cells:',JSON.stringify(cells.map(({subject,dueDay,text,sourcePage,cell})=>
 ({subject,dueDay,text:text.slice(0,130),sourcePage,cell})),null,2));
for(const [subject,day] of [['Naturfag','Tirsdag'],['Engelsk','Tirsdag'],['Matte','Torsdag'],['Norsk','Fredag']]){
 const matching=cells.filter(t=>t.subject?.toLocaleLowerCase('nb-NO')===subject.toLocaleLowerCase('nb-NO'));
 assert.equal(matching.length,1,'Original PDF must contain one '+subject+' assignment');
 assert.equal(matching[0].dueDay,day,'Original PDF column date for '+subject);
}
assert.ok(!cells.some(x=>/leksefri pga/i.test(x.text)),'Wednesday is homework-free');
console.log('Source-grounded due dates verified against the actual public PDF.');
