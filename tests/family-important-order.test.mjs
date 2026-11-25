import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Tomorrow briefing precedes weekly notices in family overview',()=>{
 const important=html.indexOf('<section class="family-tomorrow family-important"');
 const children=html.indexOf('<section id="family-children"');
 const tomorrow=html.indexOf('<section id="family-tomorrow-brief"');
 const agenda=html.indexOf('<section class="family-agenda"');
 assert.ok(tomorrow>0&&tomorrow<important&&important<children&&children<agenda);
 assert.match(html,/aria-labelledby="family-tomorrow-title"/);
 assert.match(html,/id="family-important-cards"/);
 assert.match(html,/id="family-mobile-important-more"/);
 assert.match(html,/href="\/family-desktop-tabs.css"/);
});
