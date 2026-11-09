/** Stop a PDF contact footer from being copied into pupil homework.
 * The rest of the assignment is preserved; contact data remains in contacts.
 * A genuine school task about writing an e-mail is not itself a footer.
 */
const clean=value=>String(value??'').replace(/\s+/gu,' ').trim();
const FOOTER=/\b(?:kontaktinformasjon|kontaktlærere?|kontaktperson(?:er)?|lærernes? kontaktinfo|telefonnummer|tlf\.?\s*[:：]|telefon\s*[:：]|e-?post(?:adresse)?\s*[:：])\b/iu;
const ADDRESS=/[\p{L}\p{N}.+_-]+@[\p{L}\p{N}.-]+\.[a-z]{2,}/iu;
const PHONE_LABEL=/\b(?:tlf\.?|telefon|mobil|telefonnummer)\s*[:：]?\s*(?:\+47\s*)?(?:\d[\s-]*){8,11}/iu;
const heading=/^(?:kontakt(?:informasjon|lærer(?:e)?)|e-?post|telefon(?:nummer)?|tlf\.?|mobil|hilsen)\b/iu;

export function withoutContactFooter(value){
 const input=clean(value);
 if(!input)return '';
 const lines=String(value??'').split(/\n+/u);
 const output=[];
 for(const line of lines){
  const original=clean(line);
  if(!original)continue;
  // Contact blocks frequently start on the line following a reading task.
  if(heading.test(original))break;
  const contact=original.match(PHONE_LABEL);
  const email=original.match(ADDRESS);
  const words=original.match(/\b(?:kontaktinformasjon|kontaktlærere?|e-?postadresse|tlf\.?\s*[:：]|telefon\s*[:：])\b/iu);
  // Truncate only when a verifiable contact datum is present, or a
  // distinct contact heading begins. Do not remove normal writing tasks.
  const starts=[contact?.index,email?.index,words?.index].filter(Number.isInteger);
  if(starts.length){
   const at=Math.min(...starts);
   const prefix=clean(original.slice(0,at).replace(/[,:;—–-]+$/u,''));
   if(prefix)output.push(prefix);
   break;
  }
  output.push(original);
 }
 return clean(output.join(' '));
}
