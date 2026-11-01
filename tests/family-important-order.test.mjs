import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Important this week is the first main family section on every viewport',()=>{
 const important=html.indexOf('<section class="family-tomorrow family-important"');
 const children=html.indexOf('<section id="family-children"');
 const tomorrow=html.indexOf('<section id="family-tomorrow-brief"');
 const agenda=html.indexOf('<section class="family-agenda"');
 assert.ok(important>0&&important<tomorrow&&tomorrow<children&&children<agenda);
 assert.match(html,/aria-labelledby="family-tomorrow-title"/);
 assert.match(html,/id="family-important-cards"/);
 assert.match(html,/id="family-mobile-important-more"/);
 assert.match(html,/href="\/family-desktop-tabs.css"/);
});
