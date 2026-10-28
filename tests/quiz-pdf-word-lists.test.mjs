import test from 'node:test';
import assert from 'node:assert/strict';
import {quizWords} from '../public/shared/word-quiz.mjs';
test('Sjøstrand: one word per line',()=>assert.deepEqual(quizWords([{category:'Ukas ord',text:'sol\nhus\nbok'}]),['sol','hus','bok']));
test('AI collapsed word-list spacing',()=>assert.deepEqual(quizWords([{category:'Ukas ord',text:'sol hus bok'}]),['sol','hus','bok']));
test('English comma-separated word list',()=>assert.deepEqual(quizWords([{category:'Engelske ord',text:'apple, tree, book'}]),['apple','tree','book']));
test('Do not quiz learning goals or prose',()=>assert.deepEqual(quizWords([{category:'Tema',text:'Tema: Høsten'},{category:'Ukas ord',text:'Jeg kan lese og skrive'}]),[]));
