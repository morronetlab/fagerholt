/**
 * Exact, time-limited correction confirmed by a guardian for the current
 * Wilds Minne second-grade homework. The weekly PDF text layer does not
 * currently provide a verifiable day-to-task relationship in our extractor.
 *
 * This is NOT a PDF parsing rule or a general school template. Match school,
 * grade, year, ISO week and BOTH actual homework texts before changing a plan.
 * Never apply to other lessons, schools, groups, years or weeks.
 */
const normalized=value=>String(value??'').normalize('NFKC')
 .toLocaleLowerCase('nb-NO').replace(/[–—−]/g,'-').replace(/\s+/g,' ').trim();

const norwegian=item=>{
 const subject=normalized(item.subject),text=normalized(item.text);
 return /^(?:norsk|lesing)$/.test(subject)&&
  /les i bok i sekken/.test(text)&&/10\s*[-–]\s*15\s*\.?\s*(?:min\.?|minutter)/.test(text);
};
const maths=item=>{
 const subject=normalized(item.subject),text=normalized(item.text);
 return /^(?:matte|matematikk)$/.test(subject)&&
  /tell til hundre/.test(text)&&/to siffer/.test(text);
};

export function correctWildsMinneWeek45Homework(plan){
 if(!plan||plan.schoolId!=='wildsminne'||String(plan.grade)!=='2'||
  Number(plan.year)!==2026||Number(plan.week)!==45||
  !['ok','partial'].includes(plan.status)||!Array.isArray(plan.homework))return plan;
 const norsk=plan.homework.filter(norwegian),math=plan.homework.filter(maths);
 // Never guess if the source document has changed or contains multiple
 // similar assignments; prevent accidentally switching group-scoped tasks.
 if(norsk.length!==1||math.length!==1||norsk[0].group||math[0].group)return plan;
 const targetDays=['Mandag','Tirsdag','Onsdag','Torsdag'];
 const already=JSON.stringify(norsk[0].repeatDays)===JSON.stringify(targetDays)&&
  norsk[0].dueDay==null&&math[0].dueDay==='Mandag'&&
  (!math[0].repeatDays||math[0].repeatDays.length===0);
 if(already)return plan;
 return {...plan,
  homework:plan.homework.map(task=>{
   if(task===norsk[0])return {...task,dueDay:null,repeatDays:targetDays};
   if(task===math[0])return {...task,dueDay:'Mandag',repeatDays:[]};
   return task;
  }),
  homeworkDayCorrection:'wildsminne-2-2026-w45-source-verified-v2'
 };
}
