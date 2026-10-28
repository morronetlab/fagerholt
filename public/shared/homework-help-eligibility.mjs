/**
 * Show AI help only for tasks that call for reasoning, solving problems or
 * composing an answer. Reading, memorizing and packing do not require AI.
 * Use task text, including all lines, rather than relying on the subject label.
 */
const normalized=value=>String(value??'')
  .normalize('NFC').toLocaleLowerCase('nb-NO').replace(/\s+/g,' ').trim();

// Unicode letter boundaries are necessary for Norwegian æ/ø/å.
const reasoning=/(?<![\p{L}])(?:forklar|beskriv|begrunn|sammenlign|regn(?:e)?(?:\s+ut)?|løs(?:e)?|finn\s+ut|svar(?:e)?\s+på|fortell\s+om|drøft|diskuter|undersøk|tenk\s+over|hvorfor|hvordan|oversett|spørsmål(?:ene)?|oppgav(?:e|er|ene|a)|oppg\.\s*\d+)(?![\p{L}])/iu;
const writing=/(?<![\p{L}])(?:skriv\s+(?:(?:minst|omtrent|ca\.?|\d+|en|ei|et|noen|flere)\s+){0,3}(?:setning(?:er|ene)?|fortelling|historie|tekst|dikt|sammendrag|avsnitt)|skriv\s+(?:om|hva|hvordan|hvorfor|med\s+egne\s+ord)|lag\s+(?:en|ei|et)\s+(?:fortelling|historie|tekst|dikt|presentasjon))(?![\p{L}])/iu;
const exploratory=/(?<![\p{L}])arbeid\s+med\s+(?:et\s+tema|en\s+tekst|oppgav(?:er|ene))(?![\p{L}])/iu;

export function needsHomeworkHelp(item){
 const task=normalized(typeof item==='string'?item:item?.text);
 if(!task)return false;
 // A reading duration, a page number, or more than one instruction is NOT
 // sufficient. A distinct reasoning or composition task must be present.
 return reasoning.test(task)||writing.test(task)||exploratory.test(task);
}
