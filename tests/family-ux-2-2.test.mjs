import test from 'node:test';
import assert from 'node:assert/strict';
import {importantFamilyNotices} from '../public/shared/family-important-notices.mjs';
import {familyAgendaItemHtml,familyAgendaMarkup} from '../public/shared/family-week-agenda-html.mjs';

const closure={key:'school|one',kind:'school',important:true,date:'2026-11-06',
 title:'Fredag: Planleggingsdag – elevene har fri',scope:'Barn A',
 source:{name:'Skolens PDF',url:'https://www.minskole.no/plan.pdf'}};
const vaccine={key:'school|two',kind:'school',important:true,date:null,
 title:'Vaksinasjon denne uka – husk samtykkeskjema',scope:'Barn A',
 source:{name:'Skolens PDF',url:'https://www.minskole.no/plan.pdf'}};
const municipal={key:'municipal|one',kind:'municipal',important:true,date:'2026-11-02',
 title:'Mandag: Skolefri',scope:'Fagerholt skole',
 source:{name:'Offisiell skolerute',url:'https://www.kristiansand.kommune.no/skoleruta'}};
const ordinary={key:'school|ordinary',kind:'school',important:false,date:null,
 title:'Ta med gymtøy',scope:'Barn A',
 source:{name:'Skolens PDF',url:'https://www.minskole.no/plan.pdf'}};
const homework={key:'hw|one',kind:'homework',important:false,date:'2026-11-03',
 title:'Norsk – les',scope:'Barn B',
 source:{name:'Skolens PDF',url:'https://www.minskole.no/plan.pdf'}};
const data=(items,undated=[])=>({days:[{date:'2026-11-02',title:'mandag 2. nov.',items}],
 undated,missingProfiles:[],count:items.length+undated.length});
test('Important source-backed school closures and vaccines stay prominent even without a date',()=>{
 const notices=importantFamilyNotices(data([homework,ordinary,closure,municipal],[vaccine]),{limit:3});
 assert.equal(notices.total,3);
 assert.deepEqual(notices.visible.map(x=>x.title),[
  closure.title,municipal.title,vaccine.title
 ]);
 assert.equal(notices.undated,1);
 assert.equal(notices.remaining,0);
 assert.equal(notices.visible[2].date,null);
 assert.equal(notices.visible[2].source.url,'https://www.minskole.no/plan.pdf');
});
test('Siblings sharing one school notice show one sourced card with both names',()=>{
 const same={...closure,key:'school|same',scope:'Barn B'};
 const notices=importantFamilyNotices(data([closure,same,ordinary]),{limit:1});
 assert.equal(notices.total,1);
 assert.equal(notices.visible[0].scope,'Barn A, Barn B');
 assert.equal(notices.remaining,0);
});
test('Short preview is capped, reports all hidden important items and preserves original events',()=>{
 const notices=importantFamilyNotices(data([closure,municipal],[vaccine]),{limit:2});
 assert.equal(notices.visible.length,2);
 assert.equal(notices.remaining,1);
 assert.equal(notices.total,3);
 assert.match(familyAgendaItemHtml(notices.visible[0]),/Kilde: Skolens PDF/);
 const markup=familyAgendaMarkup(data([homework],[ordinary,vaccine]));
 assert.match(markup.undated,/Vaksinasjon/);
 assert.match(markup.undated,/Ta med gymtøy/);
 assert.doesNotMatch(markup.undated,/Hele uka · ingen bestemt dag oppgitt/);
});
test('Priority preview never turns unrelated lessons into a warning',()=>{
 const notices=importantFamilyNotices(data([homework,ordinary]),{limit:3});
 assert.equal(notices.total,0);
 assert.deepEqual(notices.visible,[]);
});
