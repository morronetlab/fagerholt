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

/** Group consecutive simultaneous rows under one visible time label.
 * Preserve every description, end time and group label in its own sub-row.
 */
export function groupSimultaneousEvents(events){
 const grouped=[];
 for(const event of uniqueDayEvents(events)){
  const previous=grouped.at(-1);
  if(event.time&&previous?.time===event.time)previous.entries.push(event);
  else grouped.push({time:event.time||null,entries:[event]});
 }
 return grouped;
}
/** Highlight important vaccination details already present in the selected
 * day's schedule/notes; never invent dates, locations or medical advice.
 */
export function isVaccineNotice(value){
 return /\bvaksin[a-zæøå]*/i.test(String(value||''));
}
/** Deduplicate one day's vaccine references without discarding different
 * source facts such as timing, consent instructions or location.
 * A single highlighted note is rendered, even if PDF repeats the notice.
 */
export function notesWithImportantEvents(events,notes=[]){
 const out=[],seen=new Set(),vaccines=[];
 const keyOf=(text)=>String(text||'').toLocaleLowerCase('nb-NO')
   .replace(/\bvaksinasjon(?:en)?\b/g,'vaksine')
   .replace(/\bvaksinering\b/g,'vaksine')
   .replace(/\bkl(?:okka|okken)?\.?\s*/g,' ')
   .replace(/\b0(\d[:.])/g,'$1')
   .replace(/[.:]/g,':')
   .replace(/[^a-zæøå0-9]+/g,' ').trim();
 const add=(entry)=>{
  const text=String(entry?.text||'').trim();
  if(!text)return;
  if(isVaccineNotice(text)){
   vaccines.push({text,group:entry?.group||null});return;
  }
  const key=keyOf(text)+'|'+(entry?.group||'');
  if(seen.has(key))return;
  seen.add(key);
  out.push({...entry,text,important:Boolean(entry?.important)});
 };
 for(const note of notes)add(note);
 for(const event of uniqueDayEvents(events)){
  if(!isVaccineNotice(event.title))continue;
  add({text:[event.time?'Kl. '+event.time:null,event.title,event.endTime]
    .filter(Boolean).join(' · '),group:event.group||null});
 }
 if(vaccines.length){
  // Prefer the longest, most informative source wording; add only genuinely
  // different details instead of repeating synonymous announcements.
  vaccines.sort((a,b)=>b.text.length-a.text.length);
  const unique=[];
  for(const item of vaccines){
   const canonical=keyOf(item.text);
   const duplicate=unique.some(previous=>{
    const other=keyOf(previous.text);
    if(canonical===other||other.includes(canonical)||canonical.includes(other))return true;
    const time=t=>(t.match(/\b(?:[01]?\d|2[0-3])[:.][0-5]\d\b/g)||[]).map(x=>x.replace('.',':')).join(',');
    const a=time(item.text),b=time(previous.text);
    // "Vaksine kl 10" and "Vaksinasjon kl 10" are the same bare notice.
    return a&&a===b&&canonical.split(' ').length<=4&&other.split(' ').length<=7;
   });
   if(!duplicate)unique.push(item);
  }
  const groups=[...new Set(unique.map(x=>x.group||''))];
  const sharedGroup=groups.length===1?groups[0]:null;
  const text=unique.map(item=>groups.length>1&&item.group
    ?item.group+': '+item.text:item.text).join('\n');
  out.unshift({text,important:true,...(sharedGroup?{group:sharedGroup}:{})});
 }
 return out;
}
