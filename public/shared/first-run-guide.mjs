/** A short, optional hand-off after a guardian has finished creating a family.
 * Only derived from already loaded child profiles. Never stores profile names.
 */
export function firstRunGuideState(profiles=[]){
 const first=Array.isArray(profiles)?profiles.find(p=>p?.id&&p?.name):null;
 return first?{
  stage:'open-plan',
  heading:'Familien er klar!',
  description:'Åpne ukeplanen til '+first.name+' for å finne lekser og pakkeliste. Du kan se hele familien i Kalender.',
  primary:'Åpne ukeplanen til '+first.name,
  childId:first.id,
  checklist:[true,true,false]
 }:{
  stage:'add-child',
  heading:'Ett steg igjen',
  description:'Legg til det første barnet, så finner Skoleuka skolens ukeplan automatisk.',
  primary:'Legg til første barn',
  childId:null,
  checklist:[true,false,false]
 };
}
