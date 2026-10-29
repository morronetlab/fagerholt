import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AI_SCHEMA_VERSION,AI_SCHEMA,normalizeAIPlan} from '../lib/ai-plan.mjs';
import {planFeedback} from '../public/shared/plan-feedback.mjs';
import {createPdfPreviewHandler} from '../netlify/functions/pdf-preview.mjs';
import {siteConfig} from '../public/site-config.mjs';
const quote='Kunnskapshjørnet: Vi skal lære om dyrene i skogen';
const evidence={sourcePage:2,sourceQuote:quote};
const source=siteConfig.schools.presteheia.homepage+'/seksjon/456';
const presteheiaPdf='https://www.minskole.no/DynamicContent//Documents/860-presteheia-Ukeplan-44-Dyreheia-(1)-de95fb1b-bbf7.pdf';
const base=()=>({days:[],homework:[{subject:'Norsk',text:'Les bok i 15 minutter',dueDay:null,...evidence},{subject:'Engelsk',text:'Øv på gloser',dueDay:null,...evidence}],packing:[],notices:[],learningGoals:[{text:'Jeg kan beskrive arter',...evidence}],subjects:[],weekTheme:{text:null,sourcePage:null,sourceQuote:''},optionalMission:{text:null,sourcePage:null,sourceQuote:''},specialContent:[],coverage:{state:'complete',reason:'PDF-en har fagorganisert ukeoversikt'}});
const meta={grade:'6',year:2026,week:44,source,pdf:presteheiaPdf,pageCount:2,pageTexts:['Noe tekst på side 1',quote]};
test('Presteheia: a complete subject-organized plan is not marked partial for missing daily columns',()=>{
 const res=normalizeAIPlan(base(),meta);
 assert.equal(AI_SCHEMA_VERSION,20);
 assert.equal(res.status,'ok');
 assert.equal(res.days.Mandag.events.length,0);
 assert.equal(res.homework.length,2);
 assert.deepEqual(res.specialContent,[]);
});
test('Knowledge corner is exposed from PDF page 2 and triggers original illustration preview',()=>{
 const data=base();
 data.specialContent=[{kind:'knowledge',title:'Kunnskapshjørnet',description:'Fakta om dyrelivet i skogen',hasVisual:true,visualRegion:{x:80,y:620,width:360,height:210},...evidence}];
 const res=normalizeAIPlan(data,meta);
 assert.equal(res.status,'ok');
 assert.deepEqual(res.specialContent,[{title:'Kunnskapshjørnet',description:'Fakta om dyrelivet i skogen',kind:'knowledge',hasVisual:true,visualRegion:{x:80,y:620,width:360,height:210},sourcePage:2}]);
 assert.ok(res.provenance.some(p=>p.kind==='special-content'&&p.sourcePage===2));
});
test('Lunde på linja can show original illustrated telephone anniversary page',()=>{
 const data=base();data.specialContent=[{kind:'illustration',title:'Lunde på linja',description:'Telefonen er 150 år og skal markeres',hasVisual:true,visualRegion:{x:80,y:620,width:360,height:210},sourcePage:2,sourceQuote:'Lunde på linja: Telefonen er 150 år'}];
 const res=normalizeAIPlan(data,{...meta,grade:'2',pageTexts:['', ''],source:'https://www.minskole.no/lundeskole/seksjon/123'});
 assert.equal(res.specialContent[0].title,'Lunde på linja');
 assert.equal(res.specialContent[0].hasVisual,true);
});
test('Unsupported image references are excluded and extra section can stay hidden',()=>{
 const data=base();
 data.specialContent=[{kind:'illustration',title:'Falsk',description:'Falskt bilde',hasVisual:true,visualRegion:{x:80,y:620,width:360,height:210},sourcePage:20,sourceQuote:'Dette finnes ikke'}];
 const res=normalizeAIPlan(data,meta);
 assert.deepEqual(res.specialContent,[]);
 assert.equal(res.status,'ok');
 assert.ok(AI_SCHEMA.properties.specialContent.items.required.includes('hasVisual'));
 assert.ok(AI_SCHEMA.properties.coverage.required.includes('state'));
});
test('Actual partial coverage renders compact notice and keeps original PDF link',()=>{
 const data=base();data.coverage={state:'partial',reason:'Utydelig siste side'};
 assert.equal(normalizeAIPlan(data,meta).status,'partial');
 const info=planFeedback({school:siteConfig.schools.lundeskole,grade:'2',plan:{status:'partial',aiStatus:'ready',pdf:'https://www.minskole.no/u.pdf'}});
 assert.equal(info.kind,'partial');assert.equal(info.hideContent,false);assert.equal(info.showGrade,true);assert.equal(info.showSchool,false);assert.equal(info.showRetry,false);
});
function response(data,url){const raw=new TextEncoder().encode(data);return {ok:true,url,headers:new Headers({'content-length':String(raw.byteLength)}),arrayBuffer:async()=>raw.buffer};}
test('PDF preview proxy restricts source to selected official school weekly PDF',async()=>{
 const calls=[];
 const handler=createPdfPreviewHandler({now:()=>new Date('2026-10-28T12:00:00Z'),fetchImpl:async url=>{
  calls.push(url);
  if(url===siteConfig.schools.presteheia.homepage||url===siteConfig.schools.presteheia.homepage+'/nettstedskart')return response(`<a href="${source}">6. trinn</a>`,url);
  if(url===source)return response(`<a href="${presteheiaPdf}">Ukeplan uke 44</a>`,url);
  if(url===presteheiaPdf)return response('%PDF-1.7 example',url);
  throw new Error('Unexpected: '+url);
 }});
 const yes=await handler(new Request('https://ukeplanen.netlify.app/api/pdf-preview?school=presteheia&grade=6&url=https://evil.example/bad.pdf'));
 assert.equal(yes.status,200);assert.equal(yes.headers.get('content-type'),'application/pdf');
 assert.equal((await yes.arrayBuffer()).byteLength,16);
 assert.deepEqual(calls,[siteConfig.schools.presteheia.homepage,siteConfig.schools.presteheia.homepage+'/nettstedskart',source,presteheiaPdf]);
 const no=await handler(new Request('https://ukeplanen.netlify.app/api/pdf-preview?school=unknown&grade=6'));
 assert.equal(no.status,400);
});
test('UI hides extra section without specials and includes original-PDF rendering for image items',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/original-look.css',import.meta.url),'utf8');
 assert.match(html, /id="special-panel"[^>]*hidden/);assert.match(html,/id="special-items"/);
 assert.match(js,/panel\.hidden=!items\.length/);assert.match(js,/renderSpecialPdfPages/);assert.match(js,/import\('\/vendor\/pdf\.mjs'\)/);
 assert.match(css,/feedback-partial/);assert.match(css,/special-visual/);
 assert.match(readFileSync(new URL('../netlify.toml',import.meta.url),'utf8'),/from = "\/api\/pdf-preview"/);
});
