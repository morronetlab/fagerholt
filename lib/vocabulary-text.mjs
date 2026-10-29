/** Preserve row delimiters in model-produced vocabulary lists.
 * General plan text can collapse whitespace, but a glossary cannot: one word
 * per line must remain separate for the English-to-Norwegian quiz.
 */
export function normalizeVocabularyText(value,maxLength=600){
 const rows=String(value??'').normalize('NFC').replace(/\r\n?/g,'\n')
  .split('\n').map(row=>row.replace(/[\t \f\v\u00a0]+/g,' ').trim()).filter(Boolean);
 const lines=[];
 for(const row of rows){
  // Some PDFs wrap a translation such as "kostskole / internatskole".
  const previous=lines.at(-1);
  if(previous&&/\s\/\s*$/.test(previous)&&/^[\p{L}]+(?:[ '-][\p{L}]+){0,3}$/u.test(row))
   lines[lines.length-1]=previous+' '+row;
  else lines.push(row);
 }
 return lines.join('\n').slice(0,maxLength).trim();
}
