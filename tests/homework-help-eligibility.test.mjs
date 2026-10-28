import test from 'node:test';
import assert from 'node:assert/strict';
import {needsHomeworkHelp} from '../public/shared/homework-help-eligibility.mjs';

const routine=[
 'Les minst 10 min. i heftet ditt/ boka di!',
 'Les minst 10 minutter i heftet ditt eller boka di hver dag',
 'Leselekse: Les 10 min i boka di',
 'Norsk: Les i leseboka i 15 minutter',
 'Til torsdag: Les sidene 20–23 i leseheftet',
 'Les s. 21 og 22 i boka',
 'Les kapittel 3',
 'Les i boka side 21',
 'Les en valgfri bok',
 'Les høyt for en voksen',
 'Les 10 minutter hver dag. Kryss av etterpå.',
 'Les minst 10 min.\nLes høyt for en voksen',
 'Øv på engelske gloser',
 'Øv på gangetabellen',
 'Skriv ukas ord tre ganger',
 'Skriv ordene i skriveboka',
 'Ta med gymsko',
 'Husk gymtøy',
 'Pakk sekken',
 'Ta med badetøy\nHusk håndkle',
 'Signer lesekortet',
 'Se filmen på skolens nettside'
];
const learning=[
 'Forklar hvorfor vi har årstider',
 'Regn ut oppgavene på side 21',
 'Gjør oppgave 3 i matematikkboka',
 'Les side 21 og svar på spørsmålene',
 'Les minst 10 min. og svar på spørsmålene etterpå',
 'Les minst 10 min.\nForklar hva teksten handler om',
 'Skriv en fortelling',
 'Skriv fem setninger om helga',
 'Beskriv det du ser på bildet',
 'Hvordan løser du oppgaven?',
 'Sammenlign to dyr',
 'Oversett setningene',
 'Arbeid med et tema fra naturfag',
 'Skriv med egne ord hva teksten handler om'
];

test('Reading, spelling drill and simple reminders do not show AI help',()=>{
 for(const text of routine)assert.equal(needsHomeworkHelp({text,subject:'Norsk'}),false,text);
});
test('Independent reasoning and writing tasks retain AI help',()=>{
 for(const text of learning)assert.equal(needsHomeworkHelp({text,subject:'Matematikk'}),true,text);
});
test('No task and no subject-based assumptions',()=>{
 assert.equal(needsHomeworkHelp({text:''}),false);
 assert.equal(needsHomeworkHelp(null),false);
 assert.equal(needsHomeworkHelp({subject:'Engelsk',text:'Les 10 minutter'}),false);
 assert.equal(needsHomeworkHelp({text:'Les minst 10 min. i heftet ditt/ boka di!',repeatDays:['Mandag','Tirsdag']}),false);
 assert.equal(needsHomeworkHelp('Skriv en fortelling'),true);
});
