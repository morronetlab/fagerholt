import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAIPlan} from '../lib/ai-plan.mjs';
import {readFileSync} from 'node:fs';
const source='Ukas ord: sol, bok og hus. Læringsmål: Jeg kan lese en tekst. Tema: Høsten.';
const ref=(sourceQuote)=>({sourcePage:1,sourceQuote});
const raw={days:[],attendance:[],dayNotes:[],homework:[],packing:[],notices:[],learningGoals:[{text:'Jeg kan lese en tekst',...ref('Læringsmål: Jeg kan lese en tekst')}],subjects:[],contacts:[],specialContent:[],vocabulary:[
 {category:'Ukas ord',text:'sol, bok, hus',...ref('Ukas ord: sol, bok og hus')},
 {category:'Læringsmål',text:'Jeg kan lese en tekst',...ref('Læringsmål: Jeg kan lese en tekst')},
 {category:'Tema',text:'Høsten',...ref('Tema: Høsten')},
 {category:'Engelske ord',text:'autumn',...ref('Tema: Høsten')}
],weekTheme:{text:null,sourcePage:null,sourceQuote:''},optionalMission:{text:null,sourcePage:null,sourceQuote:''},coverage:{state:'complete',reason:''}};
test('Wilds Minne-style learning goals and themes never become word lists',()=>{
 const p=normalizeAIPlan(raw,{grade:'2',week:44,year:2026,source:'https://www.minskole.no/test',pdf:'https://www.minskole.no/file.pdf',pageTexts:[source],pageCount:1});
 assert.deepEqual(p.vocabulary,[{category:'Ukas ord',text:'sol, bok, hus'}]);
});
test('Vocabulary heading is dynamically updated from actual available categories',()=>{
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="vocabulary-title"/);
 assert.match(js,/hasEnglish&&hasNorwegian/);
 assert.match(js,/hasEnglish\?'Engelske ord':'Ukas ord'/);
});
