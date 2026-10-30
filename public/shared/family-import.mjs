/** Explicit opt-in migration: only current-week checked tasks are uploaded.
 * Previously saved local profiles and all historical progress remain untouched.
 */
import {FAMILY_STORAGE_KEY,readFamily,childProgressKey} from './family-core.mjs';
import {taskFingerprint} from './cloud-account.mjs';
import {expandHomework} from './homework-view.mjs';
export const IMPORT_MAP_PREFIX='ukeplanen.cloud.import.v1.';
export async function importCurrentLocalFamily({client,familyId,schools,calendar,storage,fetchPlan,onProgress=()=>{}}){
 const local=readFamily(storage.getItem(FAMILY_STORAGE_KEY),schools);
 if(!local.length)return {profiles:0,marked:0,notes:['Ingen lokale profiler å importere.']};
 const mappingKey=IMPORT_MAP_PREFIX+familyId;
 let mapping={};
 try{mapping=JSON.parse(storage.getItem(mappingKey)||'{}')||{};}catch{}
 let remote=await client.children(familyId);
 const notices=[];let created=0,checkedCount=0;
 for(const p of local){
  if(!Object.hasOwn(schools,p.school))continue;
  let saved=mapping[p.id];
  let child=remote.find(c=>c.id===saved);
  if(!child){
   // Existing matching profile might have been created before import; never
   // upload to it silently, because siblings can share name/school/grade.
   const createdRows=await client.createChild({family_id:familyId,nickname:p.name,
     school_id:p.school,grade:p.grade,group_name:p.group||''});
   child=createdRows?.[0];
   if(!child?.id)throw Error('Importen stoppet: serveren bekreftet ikke barneprofilen.');
   mapping[p.id]=child.id;storage.setItem(mappingKey,JSON.stringify(mapping));
   remote.push(child);created++;
  }
  onProgress('Overfører '+p.name+' …');
  const now=calendar;
  let plan;
  try{plan=await fetchPlan(p.school,p.grade);}catch{
   notices.push('Kunne ikke hente gjeldende ukeplan for '+p.name+'. Tidligere avkrysninger er beholdt lokalt.');
   continue;
  }
  if(plan?.year!==now.year||plan?.week!==now.week){
   notices.push('Ukeplanen til '+p.name+' gjelder ikke denne uka. Ingen avkrysninger ble overført.');
   continue;
  }
  let localChecks={};
  try{
   localChecks=JSON.parse(storage.getItem(childProgressKey(p,now.year,now.week,'homework'))||'{}')||{};
  }catch{}
  const tasks=expandHomework(plan.homework||[]);
  for(const [i,task] of tasks.entries()){
   if(localChecks[i]!==true)continue;
   const key=taskFingerprint({school:p.school,grade:p.grade,year:now.year,week:now.week,task});
   await client.setTask({familyId,childId:child.id,year:now.year,week:now.week,
     key,completed:true,ignoreDuplicates:true});
   checkedCount++;
  }
 }
 return {profiles:created,marked:checkedCount,notes:notices};
}
