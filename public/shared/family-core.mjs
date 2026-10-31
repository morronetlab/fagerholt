/** Ukeplanen 2.0: private, device-local family profiles and source-grounded overview. */
import {progressKey} from './selection.mjs';
import {expandHomework} from './homework-view.mjs';
import {DAYS,dayDate} from './calendar.mjs';

export const FAMILY_STORAGE_KEY='ukeplanen.family.v2';
export const FAMILY_MAX_PROFILES=6;
const gradeOk=g=>/^[1-7](?:[A-F])?$/i.test(String(g||''));
const norm=s=>String(s??'').trim().toLocaleLowerCase('nb-NO');
const validId=id=>/^[a-zA-Z0-9-]{8,80}$/.test(String(id||''));
export function validProfile(input,schools){
 if(!input||typeof input!=='object'||!validId(input.id)||typeof input.name!=='string'||
   !input.name.trim()||input.name.trim().length>40||typeof input.school!=='string'||
   !Object.hasOwn(schools,input.school)||!gradeOk(input.grade)||
   (input.group!=null&&(typeof input.group!=='string'||input.group.length>35)))return null;
 return {id:input.id,name:input.name.trim(),school:input.school,
   grade:String(input.grade).toUpperCase(),group:String(input.group||'').trim()};
}
export function readFamily(raw,schools){
 try{
  const value=typeof raw==='string'?JSON.parse(raw):raw;
  if(value?.version!==2||!Array.isArray(value.profiles))return [];
  const ids=new Set(),result=[];
  for(const candidate of value.profiles.slice(0,FAMILY_MAX_PROFILES)){
   const p=validProfile(candidate,schools);
   if(p&&!ids.has(p.id)){ids.add(p.id);result.push(p);}
  }
  return result;
 }catch{return [];}
}
export function familyDocument(profiles){return JSON.stringify({version:2,profiles});}
export function putProfile(profiles,profile,schools){
 const p=validProfile(profile,schools);
 if(!p)throw Error('Kontroller navn, skole og klassetrinn.');
 const list=[...profiles],index=list.findIndex(x=>x.id===p.id);
 if(index!==-1)list[index]=p;
 else if(list.length<FAMILY_MAX_PROFILES)list.push(p);
 else throw Error('Maksimalt seks barneprofiler per enhet.');
 return list;
}
export function childProgressKey(profile,year,week,section,day='all'){
 // Preserve the old one-class key *unchanged*; children get their own namespace.
 return progressKey(profile.school,profile.grade,year,week,section,day)+'.child.'+profile.id;
}
export function groupApplies(item,profile){
 if(!item?.group)return true;
 if(!profile?.group)return true; // No selected group: show labelled source items rather than hide evidence.
 const group=norm(item.group),selected=norm(profile.group);
 if(group===selected)return true;
 const pieces=group.split(/\s*(?:\/|,|&|\bog\b)\s*/).filter(Boolean);
 const base=selected.replace(/\s+gruppe$/,'');
 return pieces.some(piece=>piece===selected||piece===base||piece+' gruppe'===selected)||
  group.includes(selected)||group.includes(base+' og ');
}
function checked(storage,profile,cal,section,index,day='all'){
 try{
  const key=childProgressKey(profile,cal.year,cal.week,section,day);
  const raw=JSON.parse(storage(key)||'{}');
  return raw?.[index]===true;
 }catch{return false;}
}
export function schoolDayIndices(cal){
 const todayIndex=DAYS.findIndex((_,i)=>dayDate(cal.year,cal.week,i)===cal.today);
 return {today:todayIndex,next:todayIndex>=0&&todayIndex<4?todayIndex+1:null};
}
export function profileSummary(profile,plan,calendar,storage=()=>null,cloudChecked=null,cloudBagChecked=null){
 if(!plan||plan.status==='error'||plan.status==='unavailable'||plan.status==='unpublished'||
   plan.status==='unreadable'||plan.year!==calendar.year||plan.week!==calendar.week)
  return {ready:false,reason:!plan?'Henter ukeplan …':plan.status==='unpublished'?'Ukeplanen er ikke publisert ennå.':
    plan.year!==calendar.year||plan.week!==calendar.week?'Ukeplanen gjelder ikke denne uka.':
    'Ukeplanen er ikke tilgjengelig.',tasks:[],total:0,done:0,today:[],next:[],bag:[],notices:[]};
 if(plan.aiStatus==='processing')
  return {ready:false,reason:'PDF er funnet. AI-tolkingen pågår, og oversikten oppdateres automatisk.',tasks:[],total:0,done:0,today:[],next:[],bag:[],notices:[]};
 if(plan.aiStatus==='failed')
  return {ready:false,reason:'AI-tolkingen ble ikke fullført. Vi prøver igjen automatisk, eller du kan velge «Prøv AI-tolkning igjen».',tasks:[],total:0,done:0,today:[],next:[],bag:[],notices:[]};
 const tasks=expandHomework(plan.homework||[]).map((task,i)=>({
   ...task,index:i,checked:cloudChecked?!!cloudChecked(profile,task,calendar):checked(storage,profile,calendar,'homework',i),
   dueDay:task.repeatDay||task.dueDay||null
 })).filter(item=>groupApplies(item,profile));
 const {today,next}=schoolDayIndices(calendar);
 const forDay=i=>i==null?[]:tasks.filter(t=>t.dueDay===DAYS[i]);
 const dayNotes=day=>day==null?[]:(plan.dayNotes?.[DAYS[day]]||[])
   .filter(x=>groupApplies(x,profile)).map(x=>String(x?.text||'').trim()).filter(Boolean);
 const getBag=day=>{
  if(day==null)return [];
  const raw=[...(plan.everyday||[]),...(plan.days?.[DAYS[day]]?.bring||[])].filter(x=>x&&x.label&&groupApplies(x,profile));
  return [...new Map(raw.map(x=>[norm(x.label)+'|'+norm(x.group),x])).values()]
   .map((x,i)=>({...x,checked:cloudBagChecked?
     !!cloudBagChecked(profile,x,calendar,DAYS[day]):
     checked(storage,profile,calendar,'bag',i,DAYS[day])}));
 };
 // Everyday packing is one reminder for the week, not five duplicates.
 const everyday=(plan.everyday||[]).filter(item=>item?.label&&groupApplies(item,profile));
 const sharedKeys=new Set(everyday.map(item=>norm(item.label)+'|'+norm(item.group)));
 const weeklyBag=[
  ...everyday.map(item=>({...item,day:'Hver dag',checked:false})),
  ...DAYS.flatMap((day,i)=>getBag(i)
   .filter(gear=>!sharedKeys.has(norm(gear.label)+'|'+norm(gear.group)))
   .map(gear=>({...gear,day})))
 ];
 const weeklyNotices=[
  ...(plan.notices||[]).filter(item=>typeof item==='string'&&item.trim())
   .map(text=>({day:'Hele uka',text})),
  ...DAYS.flatMap((day,i)=>dayNotes(i).map(text=>({day,text})))
 ];
 return {ready:true,total:tasks.length,done:tasks.filter(x=>x.checked).length,
   tasks,today:forDay(today),next:forDay(next),bag:getBag(next),todayBag:getBag(today),
   weeklyBag,weeklyNotices,
   notices:dayNotes(next),todayNotes:dayNotes(today),todayIndex:today,nextIndex:next,
   pdf:plan.pdf||null,source:plan.source||null,status:plan.status};
}
export function familyHighlights(profiles,summaries,calendar){
 const day=schoolDayIndices(calendar);
 const items=[];
 for(const profile of profiles){
  const s=summaries.get(profile.id);
  if(!s?.ready)continue;
  for(const task of s.next.filter(x=>!x.checked))items.push({profileId:profile.id,name:profile.name,
    type:'homework',text:task.subject?task.subject+': '+task.text:task.text,day:day.next});
  for(const gear of s.bag.filter(x=>!x.checked))items.push({profileId:profile.id,name:profile.name,
    type:'bag',text:'Pakk: '+gear.label,day:day.next});
  for(const note of s.notices)items.push({profileId:profile.id,name:profile.name,
    type:'notice',text:note,day:day.next});
 }
 return items.slice(0,20);
}
