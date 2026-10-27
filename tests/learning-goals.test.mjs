import test from 'node:test';
import assert from 'node:assert/strict';
import {extractLearningGoals, analyzePdfPages} from '../lib/plan-core.mjs';

const pdf = lines => [{
  width:595,height:840,
  items:lines.map((text,i)=>({text,x:40,y:20+i*25,width:490}))
}];

test('extracts labelled learning goals, including subjects, bullets and wrapped lines', () => {
  const goals=extractLearningGoals(pdf([
    'Informasjon:',
    'Ta med refleks!',
    'Læringsmål:',
    'Norsk: Jeg kan fortelle hva en setning er',
    'og sette punktum til slutt.',
    '• Jeg kan lese høyt for en venn.',
    'Matematikk: Jeg kan løse oppgaver med tiervenner.',
    'Lekser:',
    'Norsk: Les side 42',
    'Beskjeder fra skolen:',
    'Husk gymtøy'
  ]));
  assert.deepEqual(goals, [
    'Norsk: Jeg kan fortelle hva en setning er og sette punktum til slutt.',
    'Jeg kan lese høyt for en venn.',
    'Matematikk: Jeg kan løse oppgaver med tiervenner.'
  ]);
});

test('recognizes heading with inline text, duplicates, and clean section boundaries', () => {
  const pages=[...pdf(['Ukas læringsmål: Vi kan forklare demokrati','• Vi kan lytte til andre','Informasjon','Lytt til medelever']),
    ...pdf(['Læringsmål','• Vi kan lytte til andre','Sosialt mål: Samarbeid','Mer tekst'])];
  assert.deepEqual(extractLearningGoals(pages), [
    'Vi kan forklare demokrati',
    'Vi kan lytte til andre'
  ]);
});

test('does not treat regular homework, schedule, or a social goal as learning goals', () => {
  assert.deepEqual(extractLearningGoals(pdf([
    'Ukeplan uke 44','Norsk: Vi skal skrive korte tekster',
    'Lekser: Gjør oppgaver','Sosialt mål: Lytte til hverandre',
    'Mandag: gym', 'Ukas tema: Solidaritet'
  ])), []);
  assert.deepEqual(extractLearningGoals(pdf(['Læringsmål','Lekser:', 'Norsk: Les til fredag'])), []);
});

test('keeps separate PDF learning goals per grade; does not mix with notices/homework', () => {
  const third=analyzePdfPages(pdf([
    'Læringsmål:', 'Norsk: Jeg kan skrive bokstaven A.',
    'Beskjeder:', 'Husk postmappe', 'Lekser:', 'Norsk: Les hjemme'
  ]),'3','https://www.minskole.no/3.pdf',44,2026);
  const seventh=analyzePdfPages(pdf([
    'Læringsmål:', 'Samfunnsfag: Jeg kan forklare demokratiet.',
    'Lekser:', 'Engelsk: Read a novel'
  ]),'7','https://www.minskole.no/7.pdf',44,2026);
  assert.deepEqual(third.learningGoals,['Norsk: Jeg kan skrive bokstaven A.']);
  assert.deepEqual(seventh.learningGoals,['Samfunnsfag: Jeg kan forklare demokratiet.']);
  assert.equal(third.learningGoals.some(x=>x.includes('demokratiet')),false);
  assert.equal(seventh.learningGoals.some(x=>x.includes('bokstaven')),false);
  assert.ok(third.homework.every(item=>!item.detail.includes('bokstaven')));
});

test('filters PDF boilerplate and does not carry goals onto an unrelated page', () => {
  assert.deepEqual(extractLearningGoals([
    ...pdf(['Læringsmål:','Les mer her SVG','• Jeg kan telle til ti.','Hilsen 3. trinn']),
    ...pdf(['Svømming mandag','Norsk: Les bok'])
  ]), ['Jeg kan telle til ti.']);
});
