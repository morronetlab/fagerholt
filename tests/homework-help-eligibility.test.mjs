import test from 'node:test';
import assert from 'node:assert/strict';
import {needsHomeworkHelp} from '../public/shared/homework-help-eligibility.mjs';
const yes=['Forklar hvorfor vi har årstider','Regn ut oppgavene på side 21','Les side 21 og svar på spørsmålene','Skriv en fortelling','Hvordan løser du oppgaven?'];
const no=['Ta med gymsko','Husk gymtøy','Les side 21 i boka','Les kapittel 3','Les i boka side 21','Les 15 minutter','Pakk sekken'];
test('Routine reminders and straightforward reading do not show AI tutor',()=>{for(const text of no)assert.equal(needsHomeworkHelp({text}),false,text);});
test('Learning tasks and compound reading questions retain AI tutor',()=>{for(const text of yes)assert.equal(needsHomeworkHelp({text}),true,text);});
test('Missing items do not offer help, uncertain instructions retain help',()=>{assert.equal(needsHomeworkHelp({text:''}),false);assert.equal(needsHomeworkHelp({text:'Arbeid med et tema fra naturfag'}),true);});
