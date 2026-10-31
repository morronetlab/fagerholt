import {taskFingerprint} from './task-fingerprint.mjs';
import {packingText} from './plan-display.mjs';

/** Identical key on child and guardian; day-specific even for everyday equipment. */
export function packingFingerprint({school,grade,year,week,day,item}){
 const label=packingText(String(item?.label||item?.text||''));
 if(!label||!['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'].includes(day))
  throw Error('Ugyldig pakkeliste');
 return taskFingerprint({school,grade,year,week,task:{
  subject:'packing',text:label,group:item?.group||'',dueDay:day
 }});
}
