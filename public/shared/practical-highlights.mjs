/** Source-backed practical family highlights. Never synthesizes or re-runs AI. */
import {DAYS} from './calendar.mjs';
import {groupApplies,schoolDayIndices} from './family-core.mjs';
import {adultImpactType,adultImpactRank} from './adult-impact.mjs';

const norm=text=>String(text??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('nb-NO');
const ordinaryEquipment=/^(?:pen[an]l|pennal|blyant|viskelær|matpakke|matboks|drikkeflaske|vannflaske|skolesekk|sekk|skolebok|skrivebok|leksebok|i?pad|pc|nettbrett)$/i;
const specialEvent=/\b(?:svømm|basseng|tur(?:dag)?|utflukt|skogstur|ekskursjon|konsert|forestilling|fotograf|fotografering|klassebilde|karneval|kostyme|utkledning|halloween|vaksin|besøk|kino|teater|idrettsdag|aktivitetsdag|skidag|skøyte|fagdag|avslutning|foreldremøte|elevsamtale|skoletur|leirskole|gym|kroppsøving|løp|aksjon|bursdag|samling)\w*/i;
const urgent=/\b(?:husk|ta med|viktig|endre|endring|oppmøte|møt|fravær|senere|tidligere|stengt|svømm|tur|vaksin|foreldremøte|fotograf|kostyme|klokka)\w*/i;
// Legacy cached AI plans could include this generated text as if it came from the PDF.
const syntheticPacking=/^ta med:\s*.+\s*\(sjekk hvilken dag i pdf-en\)\s*\.?$/iu;

/**
 * Priority: exceptional school notices, special gear, special activities.
 * Homework belongs on each child's plan, not on the family dashboard.
 * Keep complete source wording; the UI limits how many highlights it shows.
 */
export function practicalHighlights({profiles,summaries,plans,calendar,focus='week'}){
 const {today,next}=schoolDayIndices(calendar);
 const selected=calendar.upcoming||focus==='week'?null:
  focus==='today'?today:next;
 const dayNumbers=selected==null?(calendar.upcoming||focus==='week'?
  [0,1,2,3,4]:[]):[selected];
 const entries=[],seen=new Set();
 const evidenced=(plan,kind,label,day)=>{
  const kinds=kind==='event'?['event','notice']:kind==='gear'?['packing']:['notice','day-note','attendance','packing'];
  const body=norm(label).replace(/^(?:mandag|tirsdag|onsdag|torsdag|fredag)\s*[:–-]\s*/u,'');
  const words=new Set(body.split(/[^a-zæøå0-9]+/u).filter(word=>word.length>=5));
  const matches=[];
  for(const citation of plan.provenance||[]){
   if(!kinds.includes(citation.kind)||day&&citation.day&&citation.day!==day)continue;
   const quote=norm(citation.sourceQuote);
   if(!quote||adultImpactType(label)&&adultImpactType(quote)!==adultImpactType(label))continue;
   const overlap=[...words].filter(word=>quote.includes(word)).length;
   const exact=quote.length>=16&&(body.includes(quote)||quote.includes(body));
   const sharedEnough=overlap>=3&&overlap>=Math.ceil(words.size*0.65);
   if(exact||sharedEnough)matches.push({citation,score:(exact?100:0)+overlap});
  }
  matches.sort((a,b)=>b.score-a.score);
  // Similar passages on different pages are ambiguous: link to the PDF
  // without claiming a particular page or a verbatim excerpt.
  if(!matches.length||matches[1]?.score===matches[0].score)return null;
  return {sourceQuote:String(matches[0].citation.sourceQuote||''),
   sourcePage:matches[0].citation.sourcePage};
 };
 const push=(profile,kind,label,priority,dayOrder,day=null,plan=null)=>{
  const text=String(label||'').trim();
  if(!text)return;
  const key=profile.id+'|'+norm(text);
  if(seen.has(key))return;
  seen.add(key);
  const adultImpact=adultImpactType(text);
  const source=plan?evidenced(plan,kind,text,day):null;
  entries.push({id:profile.id,name:profile.name,kind,
   icon:kind==='gear'?'🎒':kind==='event'?'📅':'📌',label:text,
   priority,dayOrder,day,...(source||{}),...(adultImpact?{adultImpact}:{})});
 };
 for(const p of profiles){
  const s=summaries.get(p.id),plan=plans.get(p.id);
  if(!s?.ready||!plan||plan.year!==calendar.year||plan.week!==calendar.week)continue;
  const allDays=selected==null;
  const bag=allDays?s.weeklyBag:selected===today?s.todayBag:s.bag;
  for(const item of bag||[]){
   if(item.checked||/^forslag ut fra aktivitet i pdf-en/i.test(String(item.note||''))||
    ordinaryEquipment.test(norm(item.label)))continue;
   const day=allDays?item.day:DAYS[selected];
   push(p,'gear',(day&&day!=='Hver dag'?day+': ':'')+item.label,2,
    Math.max(0,DAYS.indexOf(day)),DAYS.includes(day)?day:null,plan);
  }
  // Week-wide messages matter on individual days too; do not hide them
  // just because the parent selected "I dag" or "Neste skoledag".
  const globalNotices=(plan.notices||[]).filter(x=>groupApplies(x,p))
   .map(item=>({day:'Hele uka',text:typeof item==='string'?item:
    item?.text||item?.detail||item?.title||''}));
  // Important information about a LATER school day must not disappear just
  // because the parent is viewing "Neste skoledag". Do not revive past days.
  const futureCritical=allDays?[]:(s.weeklyNotices||[]).filter(note=>{
   const day=DAYS.indexOf(note.day);
   return day>=Math.max(0,today)&&adultImpactType(note.text);
  });
  // The full-week view must include structured, group-scoped notices too.
  // profileSummary.weeklyNotices contains string notices and day notes, but
  // legacy/AI structured notice objects exist only in plan.notices.
  const notices=allDays?[...globalNotices,...(s.weeklyNotices||[])]:[
   ...globalNotices,
   ...(selected===today?s.todayNotes:s.notices||[])
    .map(text=>({day:DAYS[selected],text})),
   ...futureCritical
  ];
  for(const notice of notices||[]){
   if(typeof notice.text!=='string'||syntheticPacking.test(notice.text.trim()))continue;
   const day=notice.day==='Hele uka'||!notice.day?'':notice.day+': ';
   push(p,'notice',day+notice.text,urgent.test(notice.text)?0:3,
    Math.max(0,DAYS.indexOf(notice.day)),
    DAYS.includes(notice.day)?notice.day:null,plan);
  }
  const eventDays=allDays?dayNumbers:[...new Set([
   ...dayNumbers,...[0,1,2,3,4].filter(i=>i>=Math.max(0,today))
  ])];
  for(const i of eventDays){
   const day=DAYS[i];
   for(const event of plan.days?.[day]?.events||[]){
    const title=typeof event==='string'?event:event?.title||'';
    // Closure and altered workday information can be written as a day event
   // rather than as a school notice, so do not lose those items.
   const impact=adultImpactType(title);
   if((!dayNumbers.includes(i)&&!impact)||(!specialEvent.test(title)&&!impact)||
    !groupApplies(event,p))continue;
    push(p,'event',day+': '+title+(event.time?' kl. '+event.time:''),1,i,day,plan);
   }
  }
  for(const att of plan.attendance||[]){
   const day=DAYS.indexOf(att.day);
   if(day<0||!dayNumbers.includes(day)||!groupApplies(att,p))continue;
   const time=att.time?'kl. '+att.time+' · ':'';
   push(p,'notice',att.day+': særskilt oppmøte '+time+String(att.text||''),0,day,att.day,plan);
  }
 }
 return entries.sort((a,b)=>adultImpactRank(b.label)-adultImpactRank(a.label)||
  a.priority-b.priority||a.dayOrder-b.dayOrder);
}
