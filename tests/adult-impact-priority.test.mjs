import test from 'node:test';
import assert from 'node:assert/strict';
import {adultImpactType,adultImpactRank} from '../public/shared/adult-impact.mjs';
import {applyPracticalPriority,priorityKey} from '../public/shared/practical-priority.mjs';
import {practicalHighlights} from '../public/shared/practical-highlights.mjs';
import {rankingCandidates,rankingKey,PRIORITY_VERSION} from '../lib/practical-priority.mjs';

test('School holidays, planning days, SFO closures and altered hours impact parents workdays',()=>{
 for(const fact of [
  'Mandag: Planleggingsdag – elevene har fri',
  'Tirsdag: Fri',
  'Onsdag: Elevene har fri',
  'Fredag: SFO er stengt',
  'Skolen er stengt på fredag',
  'Mandag: Vinterferie',
  'Ingen undervisning på skolen torsdag',
  'Elevene slutter tidligere på onsdag',
  'Skolen starter senere på fredag',
  'Endret hentetid på torsdag',
  'Nytt oppmøtested og endring i oppmøte på tirsdag'
 ])assert.equal(adultImpactType(fact),'workday',fact);
});
test('Actual vaccination messages rank above routine activities, but not above school closure',()=>{
 assert.equal(adultImpactType('Onsdag: Vaksine ved helsesykepleier'), 'health');
 assert.equal(adultImpactRank('Onsdag: Vaksine ved helsesykepleier'),4);
 assert.equal(adultImpactRank('Mandag: Skolefri'),5);
 assert.equal(adultImpactRank('Svømming i bassenget'),0);
});
test('Avoid inventing closures from free-play, free reading and neutral subject programs',()=>{
 for(const fact of [
  'Mandag: Fri lek med valgfri aktivitet',
  'Fredag: Frivillig fotballturnering',
  'Elevene skal lære om frihet',
  'Onsdag: Vanlig matematikk',
  'Vi arbeider med lekser hver dag',
  'Foreldrene får informasjon om skolehverdag'
 ])assert.equal(adultImpactType(fact),null,fact);
});
test('Verified closures and vaccination appear even when school labels them ordinary day events',()=>{
 const profile={id:'child-test-1234',name:'Barn',school:'fagerholt',grade:'3',group:''};
 const plan={parser:'ai',status:'ok',aiStatus:'ready',year:2026,week:44,
  grade:'3',schoolId:'fagerholt',
  days:{
   Mandag:{events:[{title:'Planleggingsdag – elevene har fri'}],bring:[]},
   Tirsdag:{events:[{title:'Engelsk'}],bring:[]},
   Onsdag:{events:[{title:'Vaksine ved helsesykepleier'}],bring:[]},
   Torsdag:{events:[{title:'Svømming'}],bring:[]},
   Fredag:{events:[{title:'SFO er stengt'}],bring:[]}
  },everyday:[],homework:[{subject:'Norsk',text:'Les 20 minutter'}],
  notices:[],dayNotes:{},attendance:[]};
 const cal={year:2026,week:44,upcoming:true,today:'2026-10-26'};
 const summaries=new Map([[profile.id,{ready:true,weeklyBag:[],weeklyNotices:[]}]]);
 const highlights=practicalHighlights({profiles:[profile],summaries,
  plans:new Map([[profile.id,plan]]),calendar:cal});
 assert.ok(highlights.some(x=>x.label.includes('Planleggingsdag')));
 assert.ok(highlights.some(x=>x.label.includes('SFO er stengt')));
 assert.ok(highlights.some(x=>x.label.includes('Vaksine')));
 assert.ok(!highlights.some(x=>x.label.includes('Engelsk')||x.label.includes('Les 20 minutter')));
 assert.deepEqual(highlights.slice(0,2).map(x=>x.adultImpact),['workday','workday']);
 assert.equal(highlights[2].adultImpact,'health');
 const candidates=rankingCandidates(plan);
 assert.ok(candidates.some(x=>x.text.includes('Planleggingsdag')));
 assert.ok(candidates.some(x=>x.text.includes('Vaksine')));
 assert.ok(!candidates.some(x=>x.text.includes('Engelsk')));
});
test('Workday facts outrank both model mistakes and model-highlighted ordinary school activities',()=>{
 const list=[
  {kind:'notice',label:'Husk vanlig matematikk',priority:0,dayOrder:0},
  {kind:'notice',label:'Onsdag: Vaksine',priority:3,dayOrder:2},
  {kind:'event',label:'Mandag: Planleggingsdag – elevene har fri',priority:1,dayOrder:0},
  {kind:'event',label:'Tirsdag: Svømming',priority:1,dayOrder:1}
 ];
 const scores={
  [priorityKey(list[0])]:{importance:3,prepareAhead:true},
  [priorityKey(list[1])]:{importance:0,prepareAhead:false},
  [priorityKey(list[2])]:{importance:0,prepareAhead:false},
  [priorityKey(list[3])]:{importance:3,prepareAhead:true}
 };
 const sorted=applyPracticalPriority(list,scores);
 assert.equal(sorted[0].adultImpact,undefined,'Classification is derived at ranking time, not synthesized');
 assert.match(sorted[0].label,/Planleggingsdag/);
 assert.match(sorted[1].label,/Vaksine/);
 assert.deepEqual(sorted.slice(2).map(x=>x.label),[list[0].label,list[3].label]);
});
test('Changed importance criteria recompute ranking per PDF without rerunning full plan AI',()=>{
 assert.equal(PRIORITY_VERSION,2);
 assert.ok(rankingKey('v20/fagerholt/3/2026-44/hash-model.json').startsWith('priorities/v2/'));
});
