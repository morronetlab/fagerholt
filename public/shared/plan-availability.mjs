/** A common interpretation of school-plan availability across guardian/child UIs.
 * Only "unpublished" means no PDF link was found on the official grade page.
 * Never translate a timeout, 5xx, invalid PDF, or AI failure into that claim.
 */
export function planAvailability({plan=null,error=null,loading=false}={}){
 if(loading&&!plan)return {kind:'loading',label:'Henter ukeplan …',detail:'Kontrollerer skolens trinnside.'};
 if(error)return {kind:'fetch_error',label:'Kunne ikke hente ukeplan',
  detail:'Skolens opplysninger kunne ikke hentes nå. Prøv igjen.'};
 if(!plan)return {kind:'loading',label:'Henter ukeplan …',detail:'Venter på skolens opplysninger.'};
 if(plan.status==='unavailable')return {kind:'grade_missing',label:'Fant ikke trinnsiden',
  detail:'Fant ingen offisiell side for dette klassetrinnet. Kontroller skolen og trinnet.'};
 if(plan.status==='unpublished')return {kind:'unpublished',label:'Ukeplan ikke funnet på trinnsiden',
  detail:'Ingen PDF for denne uken ble funnet på skolens trinnside. Den kan være publisert et annet sted.'};
 if(plan.status==='error'){
  const pdfProblem=['pdf_download_failed','pdf_parse_failed'].includes(plan.errorCode);
  if(plan.errorCode==='pdf_parse_failed')return {kind:'parse_error',label:'PDF kunne ikke tolkes',
   detail:'PDF-en ble funnet, men innholdet kunne ikke leses. Åpne originalen eller prøv igjen.'};
  if(pdfProblem)return {kind:'download_error',label:'Kunne ikke hente skolens PDF',
   detail:'PDF-lenken ble funnet, men dokumentet kunne ikke lastes ned. Prøv igjen.'};
  return {kind:'fetch_error',label:'Kunne ikke hente ukeplan',
   detail:'Skolens side kunne ikke kontrolleres akkurat nå. Prøv igjen.'};
 }
 if(plan.aiStatus==='processing')return {kind:'analyzing',label:'PDF funnet – AI tolker',
  detail:'Vi tolker original-PDF-en. Skoleinnholdet kommer når analysen er klar.'};
 if(plan.status==='unreadable')return {kind:'unreadable',label:'PDF uten lesbart innhold',
  detail:'PDF-en ble funnet, men inneholder ikke et lesbart tekstlag. Kontroller original-PDF-en.'};
 if(plan.aiStatus==='failed')return {kind:'analysis_failed',label:'AI-tolkningen feilet',
  detail:'AI-tolkningen ble ikke fullført. Prøv igjen eller kontroller original-PDF-en.'};
 if(plan.status==='partial')return {kind:'partial',label:'Ukeplan delvis tolket',
  detail:'Noe informasjon kan mangle. Kontroller original-PDF-en.'};
 return {kind:'ready',label:'Ukeplan tilgjengelig',detail:''};
}
