import test from 'node:test';
import assert from 'node:assert/strict';
import {routeHomeworkPieces} from '../lib/homework-routing.mjs';

test('Shared homework routing preserves source metadata and never mutates assignments',()=>{
 const tasks=[
  {text:'Les side 21. Vaksine onsdag morgen. Ta med gymsko.',dueDay:'Fredag',sourcePage:2},
  {text:'Skriv tre setninger.',dueDay:'Tirsdag',sourcePage:2}
 ];
 const saved=structuredClone(tasks);
 const routed=routeHomeworkPieces(tasks);
 assert.deepEqual(routed.map(x=>x.kind),['homework','vaccine','packing','homework']);
 assert.equal(routed[1].day,'Onsdag');
 assert.equal(routed[2].day,'Fredag');
 assert.deepEqual(routed[2].labels,['Gymsko']);
 assert.equal(routed[0].item.sourcePage,2);
 assert.deepEqual(tasks,saved);
});
test('AI verified day and rules homework-column day remain independent',()=>{
 const task={text:'Ta med gymsko.',dueDay:'Fredag',sourceQuote:'no verified day'};
 assert.equal(routeHomeworkPieces([task],()=>null)[0].day,null);
 assert.equal(routeHomeworkPieces([task],x=>x.dueDay)[0].day,'Fredag');
});
test('Ordinary reading and conceptual vaccine questions stay homework',()=>{
 const routed=routeHomeworkPieces([{text:'Les minst 10 min. i boka di!'},
  {text:'Forklar hvorfor vaksiner virker.'}]);
 assert.deepEqual(routed.map(x=>x.kind),['homework','homework']);
});
