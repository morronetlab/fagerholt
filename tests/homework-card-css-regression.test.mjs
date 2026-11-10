import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('compact homework overrides legacy ID-scoped nested card decoration',()=>{
 const old=readFileSync(new URL('../public/content-categories.css',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/homework-studio-compact.css',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(old,/#homework-list \.checkrow\s*\{/);
 const rule=css.match(/#homework-list \.homework-assist-row > \.checkrow\s*\{([^}]+)\}/)?.[1];
 assert.ok(rule,'explicit ID-scoped override must beat original category CSS');
 for(const property of [/border\s*:\s*0\s*;/,/border-left\s*:\s*0\s*;/,
                        /background\s*:\s*transparent\s*;/,/padding-left\s*:\s*0\s*;/])
  assert.match(rule,property);
 const styles=[...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(x=>x[0]);
 const compact=styles.findIndex(x=>x.includes('homework-studio-compact.css'));
 assert.ok(compact>styles.findIndex(x=>x.includes('content-categories.css')));
});
