/** Single presentation taxonomy across guardian calendar, lists and child view.
 * Colors only reinforce explicit readable text and icons; source data is unchanged.
 */
export const CONTENT_TYPES=Object.freeze({
 homework:Object.freeze({icon:'📚',label:'Lekse',short:'Lekser'}),
 practical:Object.freeze({icon:'📌',label:'Praktisk fra ukeplanen',short:'Praktisk'}),
 activity:Object.freeze({icon:'⚽',label:'Aktivitet',short:'Aktivitet'}),
 municipal:Object.freeze({icon:'🏫',label:'Skoleruta',short:'Skolerute'}),
});
export const contentType=kind=>CONTENT_TYPES[kind]||CONTENT_TYPES.practical;
export const contentCategory=(kind)=>({
 homework:'homework',school:'practical',notice:'practical',gear:'practical',
 practical:'practical',event:'practical',family:'activity',activity:'activity',
 municipal:'municipal'
})[kind]||'practical';
export function contentCategoryLabel(kind,{short=false}={}){
 const type=contentType(contentCategory(kind));
 return type.icon+' '+(short?type.short:type.label);
}
