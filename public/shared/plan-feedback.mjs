/** Presentation decisions for source availability and AI parsing. */
import {planAvailability} from './plan-availability.mjs';
export function planFeedback({school=null,grade=null,plan=null,error=null,loading=false}={}){
  if(!school||!grade)return null;
  if(loading&&!plan)return {kind:'fetching',eyebrow:'HENTER DOKUMENT',title:'Henter PDF fra skolen',description:'Vi finner denne ukens originale PDF før AI begynner å lese og organisere innholdet.',showSchool:false,showGrade:false,showRetry:false,hideContent:true};
  if(plan?.status==='unpublished')return {
    kind:'missing',eyebrow:'IKKE FUNNET PÅ TRINNSIDEN',
    title:'Vi fant ingen ukeplan for denne uka på trinnsiden',
    description:`Vi fant ingen PDF for ${plan.week?'uke '+plan.week:'denne uka'} på trinnsiden til ${school.name}. Dette er ikke en bekreftelse på at skolen ikke har publisert den et annet sted.`,
    showSchool:true,showGrade:Boolean(plan.source&&plan.source!==school.homepage),showRetry:true,hideContent:true
  };
  if(plan?.status==='unavailable')return {
    kind:'missing',eyebrow:'FANT IKKE TRINNSIDEN',
    title:'Vi fant ikke ukeplanen for dette trinnet',
    description:`Vi fant ikke en offisiell trinnside for ${grade} ved ${school.name}. Gå til skolens nettside for å finne informasjonen direkte.`,
    showSchool:true,showGrade:false,showRetry:true,hideContent:true
  };
  if(error||plan?.status==='error'){
    const availability=planAvailability({plan,error});
    return {
      kind:'missing',
      eyebrow:availability.kind==='parse_error'?'PDF KUNNE IKKE TOLKES':
       availability.kind==='download_error'?'PDF KUNNE IKKE LASTES NED':'KUNNE IKKE HENTE UKEPLAN',
      title:availability.kind==='parse_error'?'Ukeplanens PDF kunne ikke tolkes':
       availability.kind==='download_error'?'Kunne ikke laste ned skolens PDF':
       'Ukeplanen er midlertidig utilgjengelig',
      description:availability.detail+' Vi har ikke bekreftet at ukeplanen mangler.',
      showSchool:true,showGrade:Boolean(plan?.source&&plan.source!==school.homepage),
      showRetry:true,hideContent:true
    };
  }
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
