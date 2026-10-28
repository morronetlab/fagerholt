/** Presentation decisions for an AI job, an absent weekly PDF or an unreadable document.
 * Pure, browser-independent state logic; never guesses whether a PDF was published.
 */
export function planFeedback({school=null,grade=null,plan=null,error=null,loading=false}={}){
  if(!school||!grade)return null;
  if(loading&&!plan)return {kind:'fetching',eyebrow:'HENTER DOKUMENT',title:'Henter PDF fra skolen',description:'Vi finner denne ukens originale PDF før AI begynner å lese og organisere innholdet.',showSchool:false,showGrade:false,showRetry:false,hideContent:true};
  if(plan?.status==='unpublished')return {
    kind:'missing',eyebrow:'INGEN UKEPLAN FUNNET',
    title:'Vi fant ingen ukeplan for denne uka',
    description:`${school.name} har ikke en ukeplan-PDF tilgjengelig ${plan.week?`for uke ${plan.week}`:`for denne uka`} på den valgte trinnsiden. Det kan hende skolen publiserer planen et annet sted.`,
    showSchool:true,showGrade:Boolean(plan.source&&plan.source!==school.homepage),showRetry:true,hideContent:true
  };
  if(plan?.status==='unavailable')return {
    kind:'missing',eyebrow:'FANT IKKE TRINNSIDEN',
    title:'Vi fant ikke ukeplanen for dette trinnet',
    description:`Vi fant ikke en offisiell trinnside for ${grade} ved ${school.name}. Gå til skolens nettside for å finne informasjonen direkte.`,
    showSchool:true,showGrade:false,showRetry:true,hideContent:true
  };
  if(error||plan?.status==='error')return {
    kind:'missing',eyebrow:'KUNNE IKKE HENTE UKEPLAN',
    title:'Ukeplanen er midlertidig utilgjengelig',
    description:`Vi klarte ikke hente informasjon fra ${school.name} akkurat nå. Du kan prøve igjen eller åpne skolens nettside.`,
    showSchool:true,showGrade:Boolean(plan?.source&&plan.source!==school.homepage),showRetry:true,hideContent:true
  };
  // AI can read scanned PDF images even when PDF.js cannot extract any text.
  // Never hide an active AI job behind a premature "unreadable PDF" screen.
  if(plan?.aiStatus==='processing')return {
    kind:'analyzing',eyebrow:'AI-ANALYSE PÅGÅR',
    title:'AI leser og organiserer ukeplanen',
    description:'Vi henter frem dagsprogram, lekser, pakkeliste og beskjeder fra original-PDF-en. Ukeplanen vises når AI er ferdig.',
    showSchool:false,showGrade:Boolean(plan?.pdf),showRetry:true,hideContent:true
  };
  if(plan?.aiStatus==='failed')return {
    kind:'missing',eyebrow:'AI-ANALYSEN BLE IKKE FULLFØRT',
    title:'Kunne ikke fullføre AI-analysen',
    description:'Statussjekken starter aldri analysen på nytt. Du kan åpne original-PDF-en eller velge «Prøv igjen» for å starte et nytt forsøk.',
    showSchool:false,showGrade:Boolean(plan?.pdf),showRetry:true,hideContent:false
  };
  if(plan?.status==='unreadable')return {
    kind:'missing',eyebrow:'PDF KUNNE IKKE LESES',
    title:'Vi fant PDF-en, men klarte ikke lese den',
    description:'Åpne skolens originaldokument for å se dagsprogram, lekser og utstyr. Vi viser ikke en tom ukeplan som om den var komplett.',
    showSchool:true,showGrade:Boolean(plan.pdf),showRetry:true,hideContent:true
  };
  if(plan?.status==='partial')return {
    kind:'partial',eyebrow:'DELVIS TOLKET',
    title:'Vi fant bare deler av ukeplanen',
    description:'Sjekk original-PDF-en for informasjon som kan mangle.',
    showSchool:false,showGrade:Boolean(plan?.pdf),showRetry:false,hideContent:false
  };
  return null;
}
