import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONTENT_TYPES,contentCategory,contentCategoryLabel}
 from '../public/shared/content-categories.mjs';
const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');

test('The same four visible categories are used throughout the parent and child interfaces',()=>{
 assert.deepEqual(Object.keys(CONTENT_TYPES),['homework','practical','activity','municipal']);
 assert.equal(contentCategory('school'),'practical');
 assert.equal(contentCategory('notice'),'practical');
 assert.equal(contentCategory('family'),'activity');
 assert.equal(contentCategory('municipal'),'municipal');
 for(const kind of Object.keys(CONTENT_TYPES)){
  const label=contentCategoryLabel(kind);
  assert.ok(label.includes(CONTENT_TYPES[kind].icon));
  assert.ok(label.includes(CONTENT_TYPES[kind].label));
  assert.match(read('content-categories.css'),new RegExp('content-kind-'+kind));
  assert.match(read('barn/content-categories.css'),new RegExp('content-kind-'+kind));
  assert.match(read('index.html'),new RegExp('content-kind-'+kind));
  assert.match(read('barn/index.html'),new RegExp('content-kind-'+kind));
 }
});
test('The family calendar and child PWA render typed entries without confusing stored values',()=>{
 const agenda=read('shared/family-week-agenda.mjs');
 assert.match(agenda,/kind:'homework'/);
 assert.match(agenda,/DAYS\.includes\(weekday\)/);
 assert.match(agenda,/summary\?\.ready/);
 assert.match(agenda,/checked:task\.checked===true/);
 const child=read('barn/child.mjs');
 assert.match(child,/contentCategoryLabel\('homework'\)/);
 assert.match(child,/contentCategoryLabel\('practical'\)/);
 assert.match(child,/contentCategoryLabel\('activity'\)/);
 assert.match(child,/contentCategoryLabel\('municipal'\)/);
 assert.match(child,/municipal\?\.schoolId===child\.school/);
 assert.match(child,/\['live','snapshot'\]\.includes\(official\.sourceStatus\)/);
 assert.doesNotMatch(child,/const\s+[^\n]*SUPABASE_SERVICE_ROLE_KEY/);
});
