# Raskere og roligere lasting av familieoversikten

## Bakgrunn
Tidligere ble *Praktisk å huske* bygd på nytt hver gang et trinn,
AI-prioriteringen eller kommunens skolerute svarte. Kommunekallet kunne
vente opptil 8,5 sekunder på nettstedet ved kald serverhurtigbuffer.

## Endring
- Ukeplanene hentes parallelt som før, uten å vente på kommunen.
- Kommunens datokilde hentes i to parallelle varianter:
  `mode=snapshot` svarer umiddelbart fra datert, tidligere kontrollert
  kommunal skolerute, og vanlig endepunkt kontrollerer den levende kilden.
  Når den levende kilden svarer, brukes den fremfor reserveversjonen
  **uansett hvilken forespørsel som ble ferdig sist**.
- Bare offentlige skolerutedatoer lagres i `sessionStorage`, per skole,
  år og uke, i maksimalt 15 minutter. Barn, familiekonto og lekser lagres
  ikke i denne hurtigbufferen. Ugyldig eller utløpt data ignoreres.
- Første visning av *Praktisk å huske* samles kort slik at ukeplaner og
  skolerute vanligvis vises sammen. Maks ventetid er 3,2 sekunder;
  barnas egne kort er tilgjengelige mens huskelisten samles.
- Hvis en integrasjon er tregere enn dette, vises de tilgjengelige dataene
  uten å blokkere resten av siden. Senere svar oppdaterer fortsatt innhold.
- Etter første visning holdes punktene i samme rekkefølge selv om en
  separat AI-prioritering blir ferdig. Nye planleggingsdager, skolefri og
  andre arbeidstidskritiske hendelser kan fortsatt plasseres øverst.
- Uendrede HTML-deler settes ikke inn i DOM på nytt. Det reduserer
  synlig hopp, fokusproblemer og unødvendig arbeid.

## Sikkerhet og kontroll
- Hurtigvariantens `sourceStatus` er alltid `snapshot`, ikke `live`.
- Den opprinnelige, kildekontrollerte integrasjonen er uendret og
  hentes fortsatt i bakgrunnen, også når en reserveversjon er vist.
- Ingen skolefri, SFO-stenging eller oppmøteinformasjon utledes.
- Ved manglende offentlig snapshot for et skoleår benyttes ordinær
  live-forespørsel. Skolerutestatus viser usikkerhet.
- Eksisterende automatiske kildekontroller, AI/PDF-cache og
  sikkerhetsgrenser beholdes.

## Akseptansekriterier
1. Første gangs besøk: *Praktisk å huske* vises i én samlet overgang når
   begge integrasjonene svarer raskt, med øvre ventetid på 3,2 sekunder.
2. Gjenåpning innen 15 minutter: kommunale datoer vises fra uke-skopet
   hurtigbuffer uten nytt blokkerende kommunenettkall.
3. En senere AI-prioritering flytter ikke eksisterende punkter mens
   forelderen leser.
4. Kommunens levende datokilde kan fortsatt overstyre reserveversjonen.
5. Uke- og skolebytte viser aldri forrige ukes eller en annen skoles datoer.
