/** Group labels must be supported by the exact source quote. */
const colors=['rød','grønn','blå','gul','oransje','lilla','rosa'];
const norm=s=>String(s||'').toLocaleLowerCase('nb-NO').replace(/[^a-zæøå0-9]+/g,' ').trim();
export function groupLabel(raw,sourceQuote=''){
 if(typeof raw!=='string'||typeof sourceQuote!=='string')return null;
 const value=raw.trim().replace(/^(?:klasse|gruppe)\s+/i,'').replace(/\s+(?:klasse|gruppe)$/i,'');
 if(!value||value.length>35)return null;
 const evidence=norm(sourceQuote);
 const color=value.match(new RegExp(`^(${colors.join('|')})(?:\\s*(?:gruppe|gruppa))?$`,'i'));
 if(color){
  const c=color[1];
  // The word "grønn" alone is not evidence of a school group.
  if(!new RegExp(`(?:^| )${c} (?:gruppe|gruppa)(?: |$)`,'i').test(evidence))return null;
  return c[0].toLocaleUpperCase('nb-NO')+c.slice(1).toLocaleLowerCase('nb-NO')+' gruppe';
 }
 if(/^[A-F]\s*(?:\/|,|og)\s*[A-F]$/i.test(value)){
  const pair=value.toUpperCase().match(/[A-F]/g);
  if(pair.every(c=>new RegExp(`(?:^| )${c}(?: |$)`,'i').test(evidence))&&/\b(?:klasse|gruppe|trinn|a\s*\/\s*b)\b/i.test(sourceQuote))return pair.join('/');
 }
 const classes=value.toUpperCase().match(/[1-7]\s*[A-F]/g);
 if(classes&&classes.length<=2&&/^(?:[1-7]\s*[A-F])(?:\s*(?:\/|,|og)\s*[1-7]\s*[A-F])?$/i.test(value)){
  if(!classes.every(c=>new RegExp(`(?:^| )${c.replace(/\s+/g,'')}(?: |$)`,'i').test(evidence)))return null;
  return classes.map(c=>c.replace(/\s+/g,'')).join('/');
 }
 if(/^[A-F]$/i.test(value)&&new RegExp(`\\b(?:klasse|gruppe|trinn)\\s*${value}\\b`,'i').test(sourceQuote))return value.toUpperCase();
 return null;
}
export function scopedGroup(raw,sourceQuote='',day=null){
 const explicit=groupLabel(raw,sourceQuote);
 if(explicit&&!colors.some(c=>explicit.toLocaleLowerCase('nb-NO').startsWith(c)))return explicit;
 if(!day||!sourceQuote)return explicit;
 const dayName=norm(day),groups=[];
 for(const part of sourceQuote.split(/[,;.]|\s+(?:mens|derimot)\s+/i)){
  const clause=norm(part);
  if(!new RegExp(`(?:^| )${dayName}(?: |$)`,'i').test(clause))continue;
  groups.push(...[...clause.matchAll(new RegExp(`(?:^| )(${colors.join('|')}) (?:gruppe|gruppa)(?: |$)`,'gi'))].map(x=>x[1]));
 }
 const found=[...new Set(groups)];
 if(found.length===1)return groupLabel(found[0],sourceQuote);
 if(found.length>1)return null;
 const allColors=[...new Set([...norm(sourceQuote).matchAll(new RegExp(`(?:^| )(${colors.join('|')}) (?:gruppe|gruppa)(?: |$)`,'gi'))].map(x=>x[1]))];
 if(allColors.length>1&&explicit&&allColors.some(c=>explicit.toLowerCase().startsWith(c)))return null;
 return explicit;
}
export function homeworkProgress(items,isChecked){
 const total=Array.isArray(items)?items.length:0;
 const done=total?items.reduce((n,_,i)=>n+(isChecked(i)?1:0),0):0;
 return {total,done,percent:total?Math.round(done/total*100):0,complete:total>0&&done===total};
}

/** Validate group label against the PDF text, independent of the AI quote. */
export function sourcedGroup(raw,quote='',day=null,pageText=''){
 const group=scopedGroup(raw,quote,day);
 if(!group||!pageText)return null;
 const source=norm(pageText);
 const color=group.match(/^(rød|grønn|blå|gul|oransje|lilla|rosa) gruppe$/i);
 if(color){
  const word=color[1].toLocaleLowerCase('nb-NO');
  return new RegExp('(?:^| )'+word+' (?:gruppe|gruppa)(?: |$)','i').test(source)?group:null;
 }
 return group.toLocaleLowerCase('nb-NO').split('/').every(part=>new RegExp('(?:^| )'+part+'(?: |$)','i').test(source))?group:null;
}
