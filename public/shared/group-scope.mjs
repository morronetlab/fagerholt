/** Group labels must be supported by the exact source quote. */
/** Named colour groups, including compact lists such as «rosa og blå gruppe».
 * A bare colour adjective (e.g. «grønn natur») is never a school group.
 */
export function groupNamesInText(value){
 const text=String(value||'').toLocaleLowerCase('nb-NO');
 const color=groupColors.join('|');
 const names=new Set();
 const consecutive=new RegExp('\\b(?:'+color+')(?:\\s+(?:gruppe|gruppa))?(?:\\s*(?:,|\\/|\\+|&|og)\\s*(?:'+color+')(?:\\s+(?:gruppe|gruppa))?)+','gi');
 for(const m of text.matchAll(consecutive)){
  if(!/\b(?:gruppe|gruppa)\b/i.test(m[0]))continue;
  for(const n of m[0].matchAll(new RegExp('\\b('+color+')\\b','gi'))){
   const word=n[1];names.add(word[0].toUpperCase()+word.slice(1)+' gruppe');
  }
 }
 for(const m of text.matchAll(new RegExp('\\b('+color+')\\s+(?:gruppe|gruppa)\\b','gi'))){
  const word=m[1];names.add(word[0].toUpperCase()+word.slice(1)+' gruppe');
 }
 return [...names];
}
/** CSS class for one verified colour-group badge; other class labels are neutral. */
export function groupColorClass(value){
 const group=String(value||'').toLocaleLowerCase('nb-NO').trim();
 const pair=[['rød','group-red'],['grønn','group-green'],['blå','group-blue'],
  ['gul','group-yellow'],['oransje','group-orange'],['lilla','group-purple'],
  ['rosa','group-pink'],['turkis','group-turquoise'],['brun','group-brown'],
  ['grå','group-gray'],['hvit','group-white'],['svart','group-black']];
 return pair.find(([color])=>group===color+' gruppe')?.[1]||'group-class';
}

export const groupColors=['rød','grønn','blå','gul','oransje','lilla','rosa','turkis','brun','grå','hvit','svart'];
const colors=groupColors;
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
