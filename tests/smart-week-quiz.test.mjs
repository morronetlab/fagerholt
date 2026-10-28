import test from 'node:test';import assert from 'node:assert/strict';
import {smartDayChoice} from '../public/shared/smart-day.mjs';
import {quizWords} from '../public/shared/word-quiz.mjs';
const date=(day,hour)=>new Date(day+'T'+hour+':00:00Z');
test('Before school ends keeps current day',()=>assert.deepEqual(smartDayChoice(date('2026-10-28','12:00'),'Europe/Oslo'),{day:2,tryNextWeek:false}));
test('After school switches to next school day',()=>assert.deepEqual(smartDayChoice(date('2026-10-28','15:00'),'Europe/Oslo'),{day:3,tryNextWeek:false}));
test('Friday afternoon and weekend request next week preview',()=>{
 assert.deepEqual(smartDayChoice(date('2026-10-30','15:00'),'Europe/Oslo'),{day:0,tryNextWeek:true});
 assert.deepEqual(smartDayChoice(date('2026-10-31','10:00'),'Europe/Oslo'),{day:0,tryNextWeek:true});
});
test('Word challenge ignores learning goals and themes and removes duplicates',()=>{
 assert.deepEqual(quizWords([{category:'Ukas ord',text:'hus, bok; sol, hus'},{category:'Tema',text:'Tema: Høsten'},{category:'Ukas ord',text:'Læringsmål: les bok'}]),['hus','bok','sol']);
});
test('Word challenge works with English word lists',()=>assert.deepEqual(quizWords([{category:'Engelske ord',text:'apple, banana, tree'}]),['apple','banana','tree']));
