/** Only show the homework tutor for tasks that need comprehension or problem-solving. */
const normalize=value=>String(value||'').toLocaleLowerCase('nb-NO').replace(/\s+/g,' ').trim();
export function needsHomeworkHelp(item){
 const subject=normalize(typeof item==='object'?item?.subject:'');
 const text=normalize(typeof item==='string'?item:item?.text);
 if(!text)return false;
 // A mixed homework entry may contain several different tasks: keep tutor available.
 if(/[\n•]/.test(String(typeof item==='string'?item:item?.text||'')))return true;
 // Reflection, analysis and exercises should always remain eligible.
 if(/(?:^|[^a-zæøå])(?:forklar|beskriv|begrunn|sammenlign|regn|løs|finn ut|svar på|skriv|fortell|drøft|diskuter|undersøk|tenk over|hvorfor|hvordan|oppgaver?|spørsmål(?:ene)?|oversett)(?=$|[^a-zæøå])/i.test(text))return true;
 // Purely logistical requests.
 if(/^(?:husk(?: å)?|ta med|pakk|ha med|lever|signer|få underskrift|møt opp)\b/.test(text))return false;
 if(/\b(?:gymtøy|gymsko|badetøy|håndkle|skiftetøy|matpakke|drikkeflaske|turklær|refleksvest)\b/.test(text)&&text.length<115)return false;
 // Reading a specific page/chapter in a book needs no extra explanation.
 if(/^(?:les|lese(?:lekse)?\s*:?\s*les|leselekse\s*:?\s*les)\s+(?:side(?:ne|r)?|s\.?|kapittel|kap\.?|sidene)\s*\d+/i.test(text)&&!/[?]/.test(text))return false;
 if(/^(?:les|lese(?:lekse)?\s*:?\s*les|leselekse\s*:?\s*les)\s+(?:i\s+)?(?:boka?|boken|leseboka|leseboken|heftet)\s*(?:side(?:ne|r)?|s\.?|kapittel|kap\.?)?\s*\d+/i.test(text)&&!/[?]/.test(text))return false;
 if(/^les(?:e)?\s+(?:\d+\s*(?:minutter|min)|hver dag|i\s+(?:valgfri\s+)?bok)\b/i.test(text)&&text.length<100&&!/[?]/.test(text))return false;
 // When uncertain, keep the tutor available.
 return true;
}
