/** Normalize clock labels and remove repeats without merging different subjects. */
const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
const clock=/\b(?:kl\.?\s*)?(?:[01]?\d|2[0-3])[:.][0-5]\d\b/gi;
const standard=s=>s.replace(/\bkl\.?\s*/gi,'').replace('.',':');
export function displayDayEvent(event){
 const original=norm(event?.title),rawTime=norm(event?.time);
 const times=[...rawTime.matchAll(clock)].map(m=>standard(m[0]));
 const titleClocks=[...original.matchAll(clock)].map(m=>standard(m[0]));
 const repeated=titleClocks.length>=2&&titleClocks.every(t=>t===titleClocks[0]);
 const sourceTime=times[0]||(repeated?titleClocks[0]:null);
 const finish=/\b(?:skolen\s+)?(?:slutt|slutter|ferdig|avsluttes)\s*(?:kl\.?\s*)?([01]?\d|2[0-3])[:.]([0-5]\d)\b/i;
 const end=original.match(finish)||rawTime.match(finish);
 const endTime=end?'Slutt kl. '+end[1]+':'+end[2]:null;
 let title=norm(original.replace(finish,' '));
 if(sourceTime){
  const repeatRx=new RegExp('\\b(?:kl\\.?\\s*)?'+sourceTime.replace(':','[:.]')+'\\b','gi');
  title=norm(title.replace(repeatRx,' ')).replace(/^[,;:–-]+|[,;:–-]+$/g,'').trim();
 }
 const bare=norm(title.replace(clock,' ').replace(/[-–,:;]/g,' '));
 if(!bare&&sourceTime)title='';
 return {title,time:sourceTime!==endTime?.replace('Slutt kl. ','')?sourceTime:null,endTime};
}
export function uniqueDayEvents(events){
 const seen=new Set(),out=[];
 for(const e of Array.isArray(events)?events:[]){
  const v=displayDayEvent(e);
  const meaningful=norm(v.title).toLocaleLowerCase('nb-NO');
  if(!meaningful&&v.time&&events.some(other=>other!==e&&displayDayEvent(other).time===v.time&&displayDayEvent(other).title))continue;
  const key=[meaningful,v.time||'',v.endTime||'',e.group||''].join('|');
  if(seen.has(key))continue;
  seen.add(key);out.push({...e,...v});
 }
 return out;
}
export function noDayScheduleMessage({hasNotes=false,complete=false}={}){
 if(hasNotes)return 'Ingen egen timeplan er oppgitt for denne dagen. Se praktisk informasjon nedenfor.';
 return complete?'Skolen har ikke oppgitt et eget dagsprogram for denne dagen. Se ukens øvrige informasjon.':'Dagsprogrammet er ikke tolket sikkert. Kontroller skolens original-PDF.';
}
