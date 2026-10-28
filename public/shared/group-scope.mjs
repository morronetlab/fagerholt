/** A group label is displayed only when its own source quote supports it. */
const colors='rød|grønn|blå|gul|oransje|lilla|rosa';
const groupPattern=new RegExp(`^(?:(?:[1-7]\\s*)?[A-F](?:\s*(?:/|,|og)\s*(?:[1-7]\\s*)?[A-F])?|(?:${colors})(?:\\s*(?:gruppe|gruppa))?)$`,'i');
const normalized=s=>String(s||'').toLocaleLowerCase('nb-NO').replace(/[^a-zæøå0-9]+/g,' ').trim();
export function groupLabel(raw,sourceQuote=''){
 if(typeof raw!=='string'||typeof sourceQuote!=='string')return null;
 const value=raw.trim().replace(/^(?:klasse|gruppe)\s+/i,'').replace(/\s+(?:klasse|gruppe)$/i,'');
 if(value.length>35||!groupPattern.test(value))return null;
 const evidence=normalized(sourceQuote);
 // Source quote must explicitly include the named group. Avoid adding group
 // labels to every schoolwide assignment on a page that also mentions groups.
 const markers=value.match(/[1-7]\s*[A-F]|\b(?:rød|grønn|blå|gul|oransje|lilla|rosa)\b|\b[A-F]\b/gi)||[];
 if(!markers.length||!markers.every(x=>evidence.includes(normalized(x))))return null;
 const colorsReg=new RegExp(`^(${colors})(?:\\s*(?:gruppe|gruppa))?$`,'i');
 const color=value.match(colorsReg);
 if(color)return color[1][0].toLocaleUpperCase('nb-NO')+color[1].slice(1).toLocaleLowerCase('nb-NO')+' gruppe';
 return value.toUpperCase().replace(/\s+/g,'');
}
export function homeworkProgress(items,isChecked){
 const total=Array.isArray(items)?items.length:0;
 const done=total?items.reduce((n,_,i)=>n+(isChecked(i)?1:0),0):0;
 return {total,done,percent:total?Math.round(done/total*100):0,complete:total>0&&done===total};
}
