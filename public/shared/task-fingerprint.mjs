/** Stable 16-hex homework key shared by guardian and QR-linked child devices. */
export function taskFingerprint({school,grade,year,week,task,day}){
 const norm=s=>String(s??'').normalize('NFKC').toLocaleLowerCase('nb-NO')
  .replace(/\s+/g,' ').trim();
 const value=[school,grade,year,week,norm(task?.subject),norm(task?.text),
  norm(task?.dueDay),norm(task?.repeatDay||day),norm(task?.group)].join('\x1f');
 let a=2166136261,b=2166136261^0x9e3779b9;
 for(let i=0;i<value.length;i++){
  const c=value.charCodeAt(i);
  a=Math.imul(a^c,16777619)>>>0;b=Math.imul(b^c,2246822519)>>>0;
 }
 return a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0');
}
