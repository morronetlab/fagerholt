/** Local-only word practice state; keyed by source vocabulary and school selection. */
const norm=s=>String(s??'').normalize('NFC').toLocaleLowerCase('nb-NO').trim();
export const practiceRoundId=r=>JSON.stringify([r?.language,r?.kind,norm(r?.word),norm(r?.translation)]);
export function practiceKey(context,language,items){
 const scope=[context?.school,context?.grade,context?.year,context?.week,language,...(context?.childId?['child',context.childId]:[])].map(x=>encodeURIComponent(String(x??'')));
 const content=JSON.stringify((items||[]).filter(x=>x.language===language).map(x=>[norm(x.word),norm(x.translation),!!x.fromPdf]));
 let hash=2166136261;
 for(let i=0;i<content.length;i++)hash=Math.imul(hash^content.charCodeAt(i),16777619)>>>0;
 return ['ukeplanen-word-practice-v1',...scope,hash.toString(36)].join(':');
}
export function newPractice(rounds,weak=[],mode='all'){
 const all=[...new Set(rounds.map(practiceRoundId))];
 const safeWeak=[...new Set(weak.filter(x=>all.includes(x)))];
 const queue=mode==='review'?all.filter(x=>safeWeak.includes(x)):all;
 if(!queue.length)return null;
 return {version:1,mode,queue,baseCount:queue.length,index:0,phase:'question',
  reviewed:mode==='review',answers:[],weak:safeWeak};
}
export function restorePractice(raw,rounds){
 try{
  const s=JSON.parse(raw),ids=new Set(rounds.map(practiceRoundId));
  if(s?.version!==1||!['all','review'].includes(s.mode)||!['question','answered','done'].includes(s.phase)||
   !Array.isArray(s.queue)||!s.queue.length||s.queue.length>60||!s.queue.every(x=>ids.has(x))||
   !Number.isInteger(s.index)||s.index<0||s.index>s.queue.length||
   !Number.isInteger(s.baseCount)||s.baseCount<1||s.baseCount>s.queue.length||
   !Array.isArray(s.answers)||!s.answers.every(a=>a&&ids.has(a.id)&&typeof a.ok==='boolean')||
   !Array.isArray(s.weak)||!s.weak.every(x=>ids.has(x))||typeof s.reviewed!=='boolean'||
   s.answers.length!==s.index+(s.phase==='answered'?1:0)||
   (s.phase==='done')!==(s.index===s.queue.length)||
   s.answers.some((a,i)=>a.id!==s.queue[i]))return null;
  return s;
 }catch{return null;}
}
export function practiceAnswer(s,ok){
 if(!s||s.phase!=='question'||typeof ok!=='boolean')return s;
 const id=s.queue[s.index],weak=new Set(s.weak);
 if(!ok)weak.add(id);
 else if(s.mode==='review'||s.index>=s.baseCount)weak.delete(id);
 return {...s,phase:'answered',answers:[...s.answers,{id,ok}],weak:[...weak]};
}
export function practiceNext(s){
 if(!s||s.phase!=='answered')return s;
 const queue=[...s.queue],index=s.index+1;
 let reviewed=s.reviewed;
 if(index===queue.length&&!reviewed&&s.mode==='all'){
  const misses=[...new Set(s.answers.slice(0,s.baseCount).filter(a=>!a.ok).map(a=>a.id))];
  queue.push(...misses);reviewed=true;
 }
 return {...s,queue,index,reviewed,phase:index===queue.length?'done':'question'};
}
export function practiceSummary(s,rounds){
 return {total:rounds.length,done:s?.index||0,correct:s?.answers.filter(x=>x.ok).length||0,
  weak:s?.weak.length||0,percentage:s?Math.round(100*s.index/s.queue.length):0};
}
