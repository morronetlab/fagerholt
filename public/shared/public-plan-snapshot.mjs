/** Short, tab-scoped warm-start cache of verified PUBLIC school PDFs only.
 * No household, profile, child, session token, checked state or activity data.
 * Always revalidate against /api/plan; never use a snapshot for cloud progress.
 */
export const PUBLIC_PLAN_SNAPSHOT_PREFIX='skoleuka.public-plan.v1:';
export const PUBLIC_PLAN_SNAPSHOT_TTL=90_000;
const MAX_CHARS=320_000;
export const planSnapshotKey=(school,grade,year,week)=>
 PUBLIC_PLAN_SNAPSHOT_PREFIX+school+':'+grade+':'+year+':'+week;
export function cacheablePublicPlan(plan,school,grade,year,week){
 return Boolean(plan&&plan.schoolId===school&&plan.grade===grade&&
  plan.year===year&&plan.week===week&&plan.status==='ok'&&
  plan.parser==='ai'&&plan.aiStatus==='ready'&&
  plan.homeworkSourceVersion===3&&plan.feedbackSourceRepairVersion===2&&
  typeof plan.pdf==='string'&&/^https:\/\//u.test(plan.pdf)&&
  Array.isArray(plan.homework)&&Array.isArray(plan.notices)&&
  plan.days&&typeof plan.days==='object');
}
export function readPublicPlanSnapshot(storage,school,grade,year,week,now=Date.now()){
 try{
  const raw=storage?.getItem(planSnapshotKey(school,grade,year,week));
  if(!raw||raw.length>MAX_CHARS)return null;
  const entry=JSON.parse(raw),age=now-entry.at;
  if(!Number.isFinite(age)||age<0||age>=PUBLIC_PLAN_SNAPSHOT_TTL||
    !cacheablePublicPlan(entry.plan,school,grade,year,week))return null;
  return entry.plan;
 }catch{return null;}
}
export function storePublicPlanSnapshot(storage,plan,school,grade,year,week,now=Date.now()){
 if(!cacheablePublicPlan(plan,school,grade,year,week))return false;
 try{
  const raw=JSON.stringify({at:now,plan});
  if(raw.length>MAX_CHARS)return false;
  storage?.setItem(planSnapshotKey(school,grade,year,week),raw);
  return true;
 }catch{return false;}
}
