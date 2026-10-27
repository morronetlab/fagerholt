import test from 'node:test';
import assert from 'node:assert/strict';
import {findPdfLinks,choosePdf} from '../lib/plan-core.mjs';
import {createPlanHandler} from '../netlify/functions/plan.mjs';
import {siteConfig} from '../public/site-config.mjs';

// These are *test fixtures* for the official links provided by the school,
// NOT hardcoded production URLs. Filenames will change from week to week.
const official={
  '4':{
    title:'Ukeplan uke 44',
    url:'https://www.minskole.no/DynamicContent//Documents/854-fagerholt-Ukeplan-uke-44-93c849fa-ad01.pdf'
  },
  '6':{
    title:'Ukeplan uke 44, 6. trinn',
    url:'https://www.minskole.no/DynamicContent//Documents/854-fagerholt-_Ukeplan-uke-44-c435a642-e540.pdf'
  }
};
const BYTES=new TextEncoder();
const response=(content,url)=>{
  const bytes=typeof content==='string'?BYTES.encode(content):content;
  return {
    ok:true,status:200,url,
    headers:new Headers({'content-length':String(bytes.byteLength)}),
    arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)
  };
};
const mockPage={width:600,height:800,items:[
  {text:'Mandag',x:10,y:70,width:45},
  {text:'Tirsdag',x:120,y:70,width:50},
  {text:'Onsdag',x:230,y:70,width:50},
  {text:'Torsdag',x:340,y:70,width:50},
  {text:'Fredag',x:450,y:70,width:50},
  {text:'Norsk: Lesing',x:10,y:100,width:80}
]};
for(const [grade,pdf] of Object.entries(official)){
  test(`official Fagerholt grade ${grade} week 44 URL is found from its own section`,()=>{
    const html=`<h3>Ukeplan</h3><a href="${pdf.url.replaceAll('&','&amp;')}">${pdf.title} PDF - 4000 KB</a>`+
      `<a href="/DynamicContent/Documents/older-uke-43-a.pdf">Ukeplan uke 43</a>`+
      `<a href="https://evil.example/ukeplan-uke-44.pdf">Ukeplan uke 44</a>`;
    const found=findPdfLinks(html,siteConfig.school.grades[grade],siteConfig.allowedSourceHosts);
    assert.equal(choosePdf(found,44)?.url,pdf.url);
    assert.equal(choosePdf(found,43)?.week,43);
    assert.ok(found.every(x=>!x.url.includes('evil.example')));
    assert.equal(choosePdf(found,45),null);
  });
  test(`API grade ${grade} fetches only its selected HTML and exact current-week PDF`,async()=>{
    const source=siteConfig.school.grades[grade];const calls=[];
    const html=`<a href="${pdf.url}">${pdf.title} PDF - 4289 KB</a>`;
    const fakeFetch=async url=>{
      calls.push(url);
      if(url===source)return response(html,source);
      if(url===pdf.url)return response('%PDF-1.7 document',pdf.url);
      throw Error('Unexpected download: '+url);
    };
    const fn=createPlanHandler({fetchImpl:fakeFetch,parsePdfPages:async()=>[mockPage],now:()=>new Date('2026-10-27T12:00:00Z')});
    const result=await fn(new Request(`https://app.test/api/plan?grade=${grade}`));
    assert.equal(result.status,200);
    const json=await result.json();
    assert.equal(json.pdf,pdf.url);
    assert.equal(json.grade,grade);
    assert.deepEqual(calls,[source,pdf.url]);
  });
}
test('filename hash changes every week: next week is matched by actual title, not fixed PDF URL',()=>{
  const changed='https://www.minskole.no/DynamicContent//Documents/854-fagerholt-_Ukeplan-uke-45-new123xyz.pdf';
  const html=`<a href="${official["6"].url}">${official["6"].title}</a><a href="${changed}">Ukeplan uke 45, 6. trinn</a>`;
  assert.equal(choosePdf(findPdfLinks(html,siteConfig.school.grades['6'],siteConfig.allowedSourceHosts),45)?.url,changed);
});
test('the MinSkole alternate official minskule.no host can be followed safely',()=>{
  const url='https://www.minskule.no/DynamicContent/Documents/new-Ukeplan-uke-44-c5.pdf';
  const found=findPdfLinks(`<a href="${url}">Ukeplan uke 44</a>`,siteConfig.school.grades['4'],siteConfig.allowedSourceHosts);
  assert.equal(choosePdf(found,44)?.url,url);
});
test('scanned PDFs with no text layer produce an explicit unreadable status rather than imaginary tasks',async()=>{
  const grade='4';const source=siteConfig.school.grades[grade],pdf=official[grade];
  const fn=createPlanHandler({
    fetchImpl:async url=>url===source?response(`<a href="${pdf.url}">${pdf.title}</a>`,source):response('%PDF-1.7 image bytes',pdf.url),
    parsePdfPages:async()=>[{width:600,height:800,items:[]}],now:()=>new Date('2026-10-27T12:00:00Z')
  });
  const body=await (await fn(new Request(`https://app.test/api/plan?grade=${grade}`))).json();
  assert.equal(body.status,'unreadable');
  assert.equal(body.parsedFromPdf,false);
  assert.match(body.warning,/tekstlag/);
  assert.deepEqual(body.homework,[]);
});
