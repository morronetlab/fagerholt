import test from 'node:test';
import assert from 'node:assert/strict';
import {homeworkItemKey, homeworkStorageKey} from '../public/homework.mjs';
import {readFileSync} from 'node:fs';

test('homework status is separately scoped to the child, school week and year', () => {
  const first=homeworkStorageKey(2026,44,'3');
  assert.notEqual(first,homeworkStorageKey(2026,44,'7'));
  assert.notEqual(first,homeworkStorageKey(2026,45,'3'));
  assert.notEqual(first,homeworkStorageKey(2027,44,'3'));
});
test('homework identity follows the assignment rather than its tab order', () => {
  const original={subject:'Norsk',detail:'Les 15 minutter hver dag'};
  assert.equal(homeworkItemKey(original),homeworkItemKey({subject:' norsk ',detail:' Les  15 minutter  hver dag '}));
  assert.notEqual(homeworkItemKey(original),homeworkItemKey({subject:'Engelsk',detail:original.detail}));
  assert.notEqual(homeworkItemKey(original),homeworkItemKey({subject:'Norsk',detail:'Skriv 5 setninger'}));
});
test('frontend includes independent homework and packing checkboxes', () => {
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
 assert.match(js, /data-hw-index/);
 assert.match(js, /data-pack-index/);
 assert.match(js, /addEventListener\('change',/);
 assert.match(js, /homeworkItemKey\(item\)/);
 assert.match(css, /\.homework-row/);
 assert.match(css, /\.pack-row/);
});
