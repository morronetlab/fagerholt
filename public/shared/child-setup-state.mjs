/** Parent-facing wording for the child's independent home-screen app.
 * A QR scan is NOT an installation. Only a PWA launch in standalone mode
 * (or OS appinstalled event) confirms the last step.
 */
export function childSetupInfo(status){
 switch(status){
  case 'installed':return {status,complete:true,label:'Barneappen er klar',
   description:'Appen er installert og åpnet fra hjemskjermen.',action:null};
  case 'activated':return {status,complete:false,label:'Åpnet på telefonen',
   description:'Åpne barnets ukeplan fra hjemskjermen for å fullføre oppsettet.',
   action:'Vis QR / veiledning'};
  case 'invited':return {status,complete:false,label:'Invitasjon klar',
   description:'Skann QR-koden på barnets telefon, og legg appen på hjemskjermen.',
   action:'Vis QR-kode'};
  case 'not_invited':return {status,complete:false,label:'Barneapp ikke satt opp',
   description:'Legg ukeplanen på barnets telefon med en QR-kode.',
   action:'Vis QR-kode'};
  default:return {status:'unknown',complete:false,label:'Sjekker barneapp',
   description:'Appstatus er ikke bekreftet. Du kan likevel åpne QR-koden.',
   action:'Vis QR-kode'};
 }
}
