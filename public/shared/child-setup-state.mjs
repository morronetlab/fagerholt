/** What a guardian can *actually* conclude from the server-side child device status.
 * A scanned QR grants browser access; only a standalone PWA launch is installation.
 * 'unknown' is a monitoring failure, not evidence that access has been lost.
 */
export function childSetupInfo(status){
 switch(status){
  case 'checking':return {status,complete:false,label:'Sjekker appstatus …',
   description:'Henter bekreftet installasjonsstatus for barnet.',action:null,step:0};
  case 'installed':return {status,complete:true,label:'App installert',
   description:'Barnet har åpnet Skoleuka fra appikonet på hjemskjermen.',action:null,step:3};
  case 'activated':return {status,complete:false,label:'QR-kode skannet',
   description:'Ukeplanen er åpnet. Legg appen på hjemskjermen og start den fra appikonet.',
   action:'Fullfør installasjon',step:2};
  case 'invited':return {status,complete:false,label:'QR-kode klar',
   description:'Barnet må skanne QR-koden og åpne sin egen ukeplan.',
   action:'Vis QR-kode',step:1};
  case 'not_invited':return {status,complete:false,label:'Barneapp ikke satt opp',
   description:'Inviter barnet med en privat QR-kode.',action:'Vis QR-kode',step:0};
  default:return {status:'unknown',complete:false,label:'Status ikke tilgjengelig',
   description:'Vi fikk ikke kontrollert appen akkurat nå. Prøv igjen eller åpne veiledningen.',
   action:'Vis QR / hjelp',step:0};
 }
}
