import test from 'node:test';
import assert from 'node:assert/strict';
import {extractTheme,analyzePdfPages} from '../lib/plan-core.mjs';
import {themePresentation,themeProgressKey} from '../public/theme.mjs';
const mk=(lines)=>[{width:595,height:840,items:lines.map((s,i)=>({text:s,x:40,y:20+i*23,width:450}))}];

test('extracts explicit weekly theme, ignores other subjects and dates',()=>{
 assert.equal(extractTheme(mk(['Ukeplan uke 44', 'Tema: Vennskap', 'Mandag 08.30-14.00'])), 'Vennskap');
 assert.equal(extractTheme(mk(['Ukas tema:', 'Vennskap og inkludering', 'Onsdag'])), 'Vennskap og inkludering');
 assert.equal(extractTheme(mk(['Ukens fokus: Respekt', 'Torsdag'])), 'Respekt');
 assert.equal(extractTheme(mk(['Periode: Solidaritet', 'Sosialt mål: Jeg bryr meg'])), 'Solidaritet · Jeg bryr meg');
 assert.equal(extractTheme(mk(['Tema: Matematikk', 'Sosialt mål: Alle har en stemme'])), 'Matematikk · Alle har en stemme');
});
test('does not manufacture themes or treat a social target as the theme itself',()=>{
 assert.equal(extractTheme(mk(['Ukens lekser: Norsk','Mandag: Svømming','Matematikk: Vi øver på klokka'])), '');
 assert.equal(extractTheme(mk(['Sosialt mål: Jeg bryr meg','Lekser: Norsk'])), '');
 assert.equal(extractTheme(mk(['Tema: Les mer her SVG','Ukeplan uke 45'])), '');
 assert.equal(extractTheme(mk(['Tema: 08:30–10:00 svømming'])), '');
});
test('weekTheme passes through to correct grade plan, not earlier week',()=>{
 const p=analyzePdfPages(mk(['Ukas tema: Solidaritet','Mandag','Tirsdag','Onsdag','Torsdag','Fredag']), '7','https://www.minskole.no/plan.pdf',44,2026);
 assert.equal(p.week,44);
 assert.equal(p.weekTheme,'Solidaritet');
});
test('theme UI challenge suggestions are independent from school PDF text',()=>{
 assert.equal(themePresentation('Solidaritet · Jeg bryr meg').emoji,'💛');
 assert.equal(themePresentation('Solidaritet · Jeg bryr meg').title,'Solidaritet');
 assert.equal(themePresentation('Solidaritet · Jeg bryr meg').subtitle,'Jeg bryr meg');
 assert.equal(themePresentation('Vennskap').title,'Vennskap');
 assert.match(themePresentation('Solidaritet · Alle har en stemme').quest,/lytt/i);
 assert.equal(themePresentation(''),null);
 const unknown=themePresentation('Matematikkens mysterier');
 assert.equal(unknown.theme,'Matematikkens mysterier');
 assert.match(unknown.quest,/Hva betyr «Matematikkens mysterier»/);
});
test('check-offs are isolated by grade, week, year and actual theme',()=>{
 const a=themeProgressKey(2026,44,'3','Solidaritet');
 assert.notEqual(a,themeProgressKey(2026,45,'3','Solidaritet'));
 assert.notEqual(a,themeProgressKey(2026,44,'7','Solidaritet'));
 assert.notEqual(a,themeProgressKey(2026,44,'3','Vennskap'));
 assert.notEqual(a,themeProgressKey(2027,44,'3','Solidaritet'));
});
test('theme is displayed only after selection, below homework',async()=>{
 const {readFileSync}=await import('node:fs');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.ok(html.indexOf('id="homework-section"')<html.indexOf('id="theme-section"'));
 assert.ok(html.indexOf('id="theme-section"')<html.indexOf('id="notices-details"'));
 assert.match(js,/themePresentation\(state\.plan\?\.weekTheme\)/);
 assert.match(js,/missionKey\(state\.grade,theme\.theme\)/);
 assert.match(js,/Jeg har gjort det!/);
});

test('7th-grade theme is taken only from explicit theme labels, never generic period',()=>{
 const grade7=mk(['Periode: Solidaritet','Sosialt mål: Samarbeide','Ukas tema: Demokrati','Sosialt mål: Alle har en stemme']);
 assert.equal(extractTheme(grade7, '7'), 'Demokrati · Alle har en stemme');
 assert.equal(extractTheme(mk(['Periode: Solidaritet','Sosialt mål: Jeg bryr meg']), '7'), '');
 assert.equal(extractTheme(mk(['Periode: Solidaritet','Sosialt mål: Jeg bryr meg']), '3'), 'Solidaritet · Jeg bryr meg');
 const p3=analyzePdfPages(mk(['Ukas tema: Vennskap','Mandag','Tirsdag','Onsdag','Torsdag','Fredag']),'3','https://www.minskole.no/plan3.pdf',44,2026);
 const p7=analyzePdfPages(mk(['Periode: Solidaritet','Ukas tema: Respekt','Mandag','Tirsdag','Onsdag','Torsdag','Fredag']),'7','https://www.minskole.no/plan7.pdf',44,2026);
 assert.equal(p3.weekTheme,'Vennskap');
 assert.equal(p7.weekTheme,'Respekt');
});
