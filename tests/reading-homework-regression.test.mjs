import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverReadingHomework,sourceRepeatDays} from '../lib/homework-days.mjs';
import {expandHomework} from '../public/shared/homework-view.mjs';

const weekdays=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];

test('Wilds Minne: AI omitted every-day phrase but existing reading task gets five checkboxes',()=>{
 const existing=[{subject:'Norsk',text:'Les i boka',dueDay:null,repeatDays:[]}];
 const extra=recoverReadingHomework(['Leselekse: Les i boka hver dag. Husk gymtøy på fredag.'],existing);
 assert.deepEqual(extra,[]);
 assert.deepEqual(existing[0].repeatDays,weekdays);
 assert.equal(expandHomework(existing).length,5);
});
test('A reading task for Monday to Thursday receives four weekdays, not five',()=>{
 const existing=[{subject:'Norsk',text:'Les 15 minutter i valgfri bok',repeatDays:[]}];
 recoverReadingHomework(['Leselekse: Les 15 minutter i valgfri bok mandag til torsdag.'],existing);
 assert.deepEqual(existing[0].repeatDays,weekdays.slice(0,4));
});
test('An explicit Tuesday due date and unrelated days in a notice do not create recurring homework',()=>{
 const existing=[{subject:'Norsk',text:'Les i boka til tirsdag',repeatDays:[]}];
 recoverReadingHomework(['Lekser: Les i boka til tirsdag. Tur onsdag og svømming torsdag.'],existing);
 assert.deepEqual(existing[0].repeatDays,[]);
 assert.deepEqual(sourceRepeatDays('Les i boka til tirsdag','Les i boka til tirsdag'),[]);
});
