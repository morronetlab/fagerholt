import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const family=read('public/family-ui.mjs');
const visual=read('public/family-v3.css');
const setup=read('public/child-app-setup.css');

test('Child identity precedes QR onboarding; no long explanatory copy in card',()=>{
 const markup=family.slice(family.indexOf("return '<article class=\"family-child\""),family.indexOf("function dismissFirstRunGuide"));
 assert.ok(markup.indexOf('family-child-heading')<markup.indexOf('childSetupMarkup(p)'), 'QR must follow identity');
 assert.match(family,/Barneapp ikke aktivert/);
 assert.match(family,/>Hjelp<\/button>/);
 assert.doesNotMatch(family,/Se lekser, pakkeliste og ordøving|Se og kryss av utstyr alle dager|Ingen ordøving i denne ukeplanen|Neste uke er ikke hentet ennå/);
 assert.match(family,/family-child-setup-actions/);
 assert.match(setup,/grid-template-columns:minmax\(0,1fr\)/);
});
test('Homework progress copy is compact and zero homework remains explicit',()=>{
 assert.match(family,/<span>Lekser<\/span><b>/);
 assert.match(family,/s\.done\+' av '\+s\.total\+' fullført<\/b>/);
 assert.match(family,/Ingen lekser i dag/);
 assert.match(family,/nearbyDay&&nearbyBag\?\.length/);
 assert.match(family,/hasWeekPacking\?/);
 assert.match(family,/practice\?'<p class="family-word-state"/);
});
test('Native disclosure structure supports independent nested sections',()=>{
 assert.match(family,/<details class="family-child-extra"/);
 assert.match(family,/<details class="family-packing-week"/);
 assert.match(family,/expandedChildren\.has\(p\.id\)/);
 assert.match(family,/expandedPacking\.has\(p\.id\)/);
 assert.match(family,/card\.querySelector\('\.family-packing-week'\)\?\.open/);
 assert.match(visual,/\.family-child-extra>summary::after,/);
 assert.match(visual,/\.family-packing-week>summary::after/);
 assert.doesNotMatch(visual,/\.family-child-extra summary::after\{content:'⌄'/);
 assert.match(visual,/transform:rotate\(225deg\)/);
});
test('Card action handlers and storage contracts are unchanged',()=>{
 for(const trigger of ['data-family-open','data-family-edit','data-family-remove','data-family-help','data-family-pair','data-family-bag','data-family-check']){
  assert.ok(family.includes(trigger),trigger+' remains wired');
 }
 assert.match(family,/sk-action--navigate.*data-family-open/);
 assert.match(family,/sk-action--modal.*data-family-edit/);
 assert.match(family,/sk-action--danger.*data-family-remove/);
 assert.match(visual,/repeat\(auto-fit,minmax\(min\(100%,300px\),1fr\)\)/);
 assert.match(visual,/@media\(max-width:759px\)/);
});
