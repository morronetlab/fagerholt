/** Homework key compatibility between the guardian cloud UI and child devices. */
import {taskFingerprint} from '../shared/task-fingerprint.mjs';

export function childTaskKey(profile,calendar,task){
 return taskFingerprint({school:profile.school,grade:profile.grade,
  year:calendar.year,week:calendar.week,task});
}
export function checkedProgress(rows){
 if(!Array.isArray(rows))throw Error('Ugyldig lekseprogresjon fra serveren.');
 const progress=new Map();
 for(const row of rows){
  if(!/^[a-f0-9]{16}$/u.test(row?.key)||typeof row.completed!=='boolean')
   throw Error('Ugyldig lekseprogresjon fra serveren.');
  progress.set(row.key,row.completed);
 }
 return progress;
}
/** Never overwrite a parent-set true/false value when importing former local marks.
 * A missing row is distinct from completed:false (an intentional undo).
 */
export function importCandidates(tasks,profile,calendar,cloud,local){
 if(!(cloud instanceof Map))return [];
 return tasks.filter(task=>local?.[String(task.index)]===true&&
  !cloud.has(childTaskKey(profile,calendar,task)));
}
